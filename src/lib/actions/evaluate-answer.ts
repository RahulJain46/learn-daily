"use server";

import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { getModel, pickEvalModel, modelNameForTask } from "@/lib/ai/gemini";
import { embedText, toPgvector } from "@/lib/ai/embeddings";

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

export interface RubricScore {
  score: number; // 0-5
  feedback: string;
}

/**
 * Staff+ Competency Matrix — 7 dimensions.
 *
 * The first 5 measure the answer itself (was it good?).
 * The last 2 measure staff-specific signal that distinguishes L6+ from senior:
 *   - operational_excellence: would this survive contact with prod?
 *   - influence_communication: could you sell this to a skeptical stakeholder?
 */
export interface AnswerRubric {
  technical_accuracy: RubricScore;
  depth: RubricScore;
  communication_clarity: RubricScore;
  tradeoff_awareness: RubricScore;
  staff_level_signal: RubricScore;
  operational_excellence: RubricScore;
  influence_communication: RubricScore;
}

export interface AnswerEvaluation {
  overall_score: number; // 0-100
  verdict: "excellent" | "strong" | "adequate" | "weak" | "incorrect";
  rubric: AnswerRubric;
  strengths: string[];
  gaps: string[];
  missed_keywords: string[];
  improved_answer: string;
  follow_up_questions: string[];
  /** Which Gemini model was used — surfaced in the UI for transparency. */
  model_used?: string;
}

interface EvaluateAnswerInput {
  cardId: string;
  question: string;
  modelAnswer: string;
  userAnswer: string;
  questionType: "short_answer" | "flashcard" | "mcq";
  category?: string | null;
  subcategory?: string | null;
  difficulty?: string | null;
  sessionId?: string | null;
}

const RUBRIC_KEYS: (keyof AnswerRubric)[] = [
  "technical_accuracy",
  "depth",
  "communication_clarity",
  "tradeoff_awareness",
  "staff_level_signal",
  "operational_excellence",
  "influence_communication",
];

export async function evaluateAnswer(
  input: EvaluateAnswerInput
): Promise<{ success: true; evaluation: AnswerEvaluation } | { success: false; error: string }> {
  if (!input.userAnswer?.trim()) {
    return { success: false, error: "Empty answer cannot be evaluated" };
  }

  const task = pickEvalModel({
    questionType: input.questionType,
    category: input.category,
    difficulty: input.difficulty,
  });

  let model;
  try {
    model = getModel(task, {
      json: true,
      // Pro gets a slightly lower temperature for stricter calibration;
      // Flash gets a touch more room since it's used on simpler prompts.
      temperature: task === "answer_eval_deep" ? 0.3 : 0.4,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI not configured";
    return { success: false, error: message };
  }

  const prompt = buildEvaluationPrompt(input);

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const evaluation = parseEvaluation(text);

    if (!evaluation) {
      return { success: false, error: "Failed to parse AI evaluation" };
    }

    evaluation.model_used = modelNameForTask(task);

    // Persist evaluation (best-effort, non-blocking on failure).
    // The `rubric` column is JSONB, so the 2 new dimensions need no migration.
    try {
      const supabase = await createClient();
      const userId = await getUserId();
      const { data: insertedRow } = await supabase
        .from("answer_evaluations")
        .insert({
          user_id: userId,
          card_id: input.cardId,
          session_id: input.sessionId ?? null,
          user_answer: input.userAnswer,
          overall_score: evaluation.overall_score,
          verdict: evaluation.verdict,
          rubric: evaluation.rubric,
          strengths: evaluation.strengths,
          gaps: evaluation.gaps,
          improved_answer: evaluation.improved_answer,
          follow_up_questions: evaluation.follow_up_questions,
        })
        .select("id")
        .single();

      // Embed the qualitative gap text. This is the highest-leverage
      // embedding in the app — it's what powers recurring-weakness
      // clustering in the Knowledge Gap Analyzer. Fire-and-forget; if
      // it fails the row still exists and the backfill route will
      // pick it up.
      if (insertedRow?.id && evaluation.gaps.length > 0) {
        void (async () => {
          try {
            const vector = await embedText(
              evaluation.gaps.join(" | "),
              "document"
            );
            if (!vector) return;
            await supabase
              .from("answer_evaluations")
              .update({ gaps_embedding: toPgvector(vector) })
              .eq("id", insertedRow.id);
          } catch (err) {
            console.warn("[evaluate-answer] gaps embedding failed:", err);
          }
        })();
      }
    } catch {
      // Persistence is non-critical for the user-facing evaluation
    }

    return { success: true, evaluation };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

function buildEvaluationPrompt(input: EvaluateAnswerInput): string {
  const context = [
    input.category ? `Category: ${input.category}` : null,
    input.subcategory ? `Subcategory: ${input.subcategory}` : null,
    input.difficulty ? `Difficulty: ${input.difficulty}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a Staff/Principal-level engineering interviewer at a top tech company (FAANG/equivalent). Your job is to evaluate a candidate's answer against a STAFF+ COMPETENCY MATRIX — not just whether it's "correct," but whether it demonstrates the depth, calibration, operational maturity, and influence expected of an L6+ engineer.

${context ? `INTERVIEW CONTEXT:\n${context}\n` : ""}
QUESTION:
${input.question}

REFERENCE / MODEL ANSWER (what an interviewer would consider acceptable):
${input.modelAnswer}

CANDIDATE'S ANSWER:
${input.userAnswer}

Evaluate the candidate's answer on SEVEN dimensions, each scored 0-5 (integers only):

1. **technical_accuracy** — Is the answer factually/technically correct? Are there bugs, misconceptions, or hand-wavy claims?
2. **depth** — Does it go beyond surface-level recall? Does it explain *why*, not just *what*? Does it demonstrate first-principles thinking?
3. **communication_clarity** — Is the answer well-structured, concise, and easy to follow? Would a cross-functional audience understand it?
4. **tradeoff_awareness** — Did the candidate explicitly acknowledge alternatives, edge cases, scaling limits, or when their approach BREAKS DOWN? Did they explain *why* they chose this approach over others? An answer that ignores trade-offs scores 0-2 here regardless of correctness.
5. **staff_level_signal** — Does the answer reflect senior judgment — system thinking, ambiguity handling, prioritization, real-world experience? Or does it read like a junior/mid-level recital?
6. **operational_excellence** — Did the candidate consider what happens AFTER the design is shipped? Monitoring, alerting, deployment strategy, migration path, on-call burden, failure modes, rollback, capacity planning, cost. Pure design without operational thinking is mid-level work.
7. **influence_communication** — How would the candidate convince a skeptical stakeholder (PM, exec, junior eng) of this approach? Did they frame the WHY in terms the audience cares about (cost, risk, customer impact, time-to-market)? Could they defend this in a design review?

SCORING SCALE per dimension:
- 5 = Exceptional, would impress a staff-level bar raiser
- 4 = Strong staff-level answer
- 3 = Solid senior-level answer; staff candidate would push deeper
- 2 = Mid-level; significant gaps for staff bar
- 1 = Junior-level or major gaps
- 0 = Missing/incorrect/not addressed

CRITICAL CALIBRATION RULES:
- For dimensions 4, 6, and 7: an answer that does not EXPLICITLY address the dimension scores at most 2, even if the rest is excellent. Absence of trade-off/operational/influence thinking IS the staff-level gap. Do not generously infer it.
- Be HONEST and CALIBRATED. Do not inflate scores to be encouraging.
- A staff-level interviewer would rather give a 2 with actionable feedback than a soft 4.

Compute overall_score as a 0-100 integer (NOT a simple average — weight technical_accuracy and depth slightly higher; an answer with major factual errors should not exceed 50; an answer with strong tech but zero trade-off/operational thinking should not exceed 65).

Verdict mapping:
- 85-100: "excellent"
- 70-84: "strong"
- 55-69: "adequate"
- 35-54: "weak"
- 0-34: "incorrect"

ALSO IDENTIFY: Up to 5 important keywords/concepts a staff-level answer would have mentioned but the candidate missed (e.g. "backpressure", "idempotency", "circuit breaker", "blast radius", "SLO"). Use lowercase short tokens.

Respond with ONLY this JSON shape (no markdown, no prose):
{
  "overall_score": <0-100>,
  "verdict": "<excellent|strong|adequate|weak|incorrect>",
  "rubric": {
    "technical_accuracy":      { "score": <0-5>, "feedback": "<1-2 sentences, specific>" },
    "depth":                   { "score": <0-5>, "feedback": "<1-2 sentences, specific>" },
    "communication_clarity":   { "score": <0-5>, "feedback": "<1-2 sentences, specific>" },
    "tradeoff_awareness":      { "score": <0-5>, "feedback": "<1-2 sentences, specific>" },
    "staff_level_signal":      { "score": <0-5>, "feedback": "<1-2 sentences, specific>" },
    "operational_excellence":  { "score": <0-5>, "feedback": "<1-2 sentences, specific>" },
    "influence_communication": { "score": <0-5>, "feedback": "<1-2 sentences, specific>" }
  },
  "strengths": ["<concrete thing the candidate did well>", "..."],
  "gaps": ["<concrete missing/weak point>", "..."],
  "missed_keywords": ["<lowercase keyword>", "..."],
  "improved_answer": "<a tightened, staff-level version of the answer in 4-8 sentences — show, don't just tell. Explicitly model trade-offs and operational thinking.>",
  "follow_up_questions": ["<probing question a staff interviewer would ask next>", "<another>", "<another>"]
}

Keep arrays to 2-5 items each. Be specific — reference the candidate's actual words where helpful.`;
}

function parseEvaluation(text: string): AnswerEvaluation | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(cleaned) as Partial<AnswerEvaluation>;

    if (
      typeof parsed.overall_score !== "number" ||
      !parsed.verdict ||
      !parsed.rubric
    ) {
      return null;
    }

    // Validate every required rubric dimension exists with a numeric score.
    for (const key of RUBRIC_KEYS) {
      const dim = parsed.rubric[key];
      if (!dim || typeof dim.score !== "number") {
        // Backfill missing dimensions defensively rather than failing the whole eval —
        // helps during the rollout window where a model occasionally drops a key.
        parsed.rubric[key] = { score: 0, feedback: "Not evaluated." };
      } else {
        parsed.rubric[key] = {
          score: Math.max(0, Math.min(5, Math.round(dim.score))),
          feedback: dim.feedback ?? "",
        };
      }
    }

    const evaluation: AnswerEvaluation = {
      overall_score: Math.max(0, Math.min(100, Math.round(parsed.overall_score))),
      verdict: parsed.verdict,
      rubric: parsed.rubric as AnswerRubric,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      missed_keywords: Array.isArray(parsed.missed_keywords) ? parsed.missed_keywords : [],
      improved_answer: parsed.improved_answer ?? "",
      follow_up_questions: Array.isArray(parsed.follow_up_questions)
        ? parsed.follow_up_questions
        : [],
    };

    return evaluation;
  } catch {
    return null;
  }
}
