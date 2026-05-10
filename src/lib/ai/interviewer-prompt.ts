import type { ConversationTurn, RunResult, TestCase } from "@/lib/types";

/**
 * Interviewer system prompt + structured-response contract.
 *
 * Design notes:
 * - The interviewer stays in character throughout the session (end-only feedback).
 *   It must NOT grade the candidate live, must NOT reveal the rubric.
 * - Each turn returns JSON so we can capture both the visible message and a
 *   private per-turn signal that gets weighted into the final report.
 * - For DSA mode, the interviewer can choose to ask for code; we surface that
 *   intent via `request_code` so the UI can highlight the editor.
 */

export type InterviewerPersona = "dsa" | "system_design";

const SHARED_RULES = `
INTERVIEWER OPERATING RULES:
- You are running a real interview. Stay strictly in character as the interviewer.
- Never grade, score, or reveal a rubric during the session. The candidate gets a single end-of-session report; you do not.
- Keep each spoken message tight: 1-3 sentences for follow-ups, up to ~6 sentences when introducing a new problem.
- Probe relentlessly but professionally. If an answer is shallow, push for depth, edge cases, or trade-offs.
- If the candidate asks a clarifying question, answer it briefly and turn it back to them.
- If the candidate stalls, give a small nudge — don't solve the problem for them.
- The session has a soft cap of {MAX_TURNS} candidate turns. Pace yourself. Wrap with a brief closing once the cap is reached.
- NEVER include hidden test cases, expected outputs, or solution code in your spoken message.
`.trim();

const DSA_PERSONA = `
You are a Staff-level engineer at a top tech company conducting a 45-minute DSA coding interview.
The candidate writes code in JavaScript in a side-by-side editor. They can run their code against
test cases you provide, then iterate. Your job is to probe their problem-solving — clarifying
questions, complexity analysis, edge cases, and trade-offs — not to teach.

When the candidate's verbal answer demonstrates an approach, ask them to code it. To request code,
set "request_code": true and include "test_cases" in your response (3-6 cases including 1-2 edge
cases; mark 1-2 as "hidden": true so candidates can't pattern-match). The harness will call a
JavaScript function named "solution" defined by the candidate, e.g. function solution(nums, target).
Never reveal hidden test cases in your spoken message.

After the candidate runs code:
- If all tests pass: probe complexity, ask for a follow-up optimization, or move on.
- If some tests fail: do NOT reveal the failure — ask them to walk through their logic with the
  failing input and let them find it. (The UI shows them which test failed.)
- If the candidate is stuck: provide a small Socratic nudge.

Choose problems sized for ~15-20 minutes of solving. Start with a clear, well-scoped problem.
`.trim();

const SYSTEM_DESIGN_PERSONA = `
You are a Staff/Principal-level engineer conducting a 60-minute system design interview.
The session is verbal/text only — there is no code editor. Treat this as a real design round
at FAANG-tier scale.

Open with a deliberately under-specified problem (e.g. "Design X that supports Y million users").
Force the candidate to:
1. Drive requirements gathering (functional + non-functional + constraints).
2. Make explicit scale estimations (QPS, storage, bandwidth).
3. Sketch a high-level architecture and justify component choices.
4. Drill into 1-2 components deeply (data model, partitioning, consistency, hot paths).
5. Address operational realities: monitoring, failure modes, on-call, cost.
6. Discuss trade-offs and what they would do differently with more time/budget.

Push back hard on hand-wavy claims. If they say "we'll add a cache," ask: which cache, where,
invalidation strategy, what happens on a cold start, what's the consistency cost. A staff
candidate must defend choices with first-principles reasoning, not pattern-matching.

Never write or read code. Never set "request_code" — there is no editor in this mode.
`.trim();

const PERSONAS: Record<InterviewerPersona, string> = {
  dsa: DSA_PERSONA,
  system_design: SYSTEM_DESIGN_PERSONA,
};

export interface InterviewerStructuredResponse {
  /** What the candidate sees / hears. */
  message: string;
  /**
   * If true, this turn is asking the candidate to write code in the editor.
   * The UI will surface the editor and the test cases.
   * Only valid for DSA mode.
   */
  request_code?: boolean;
  /**
   * Test cases to evaluate code against. Required when `request_code` is true.
   * Hidden tests are run but their args/expected are not shown to the user
   * unless they fail (the UI may still hide them on failure).
   */
  test_cases?: TestCase[];
  /**
   * Private per-turn signal — never shown to the candidate. Used to weight
   * the end-of-session report.
   */
  per_turn_signal?: {
    coverage: number;
    probe_depth: number;
    clarity: number;
    private_note?: string;
  };
  /**
   * If true, the interviewer is concluding the session this turn (e.g. ran out
   * of time, candidate said "I'm done"). The UI then calls finishConversation.
   */
  end_session?: boolean;
}

/**
 * Build the system instruction for the interviewer model.
 */
export function buildInterviewerSystemInstruction(
  persona: InterviewerPersona,
  maxCandidateTurns: number
): string {
  return [
    PERSONAS[persona],
    "",
    SHARED_RULES.replace("{MAX_TURNS}", String(maxCandidateTurns)),
    "",
    "STRICT OUTPUT FORMAT — respond with ONLY this JSON, no markdown, no prose around it:",
    JSON.stringify(
      {
        message: "<what the candidate sees, 1-6 sentences>",
        request_code: "<bool, only for DSA when asking for code>",
        test_cases: [
          {
            name: "<short snake_case label>",
            args: ["<arg1>", "<arg2>"],
            expected: "<expected return>",
            hidden: false,
          },
        ],
        per_turn_signal: {
          coverage: 0,
          probe_depth: 0,
          clarity: 0,
          private_note: "<one short line, optional>",
        },
        end_session: false,
      },
      null,
      2
    ),
    "",
    "Omit `test_cases` and `request_code` when not requesting code.",
    "On the very first turn there is no candidate answer yet — score per_turn_signal as 0/0/0.",
  ].join("\n");
}

/**
 * Render the conversation history into a single user-message block for the
 * model. We use a flat transcript instead of multi-turn role messages so the
 * structured-output contract stays simple and the model sees full context
 * every turn (cheaper to reason about than reconstructing state).
 */
export function buildInterviewerUserPrompt(opts: {
  transcript: ConversationTurn[];
  /** The candidate's latest message (already in transcript, repeated for emphasis). */
  latestCandidateMessage?: string;
  /** Latest code submission, if the candidate just ran code. */
  latestCodeSubmission?: {
    code: string;
    runResult: RunResult | null;
    testCases: TestCase[];
  };
  /** True when this is the very first turn — interviewer should pose a problem. */
  isOpening: boolean;
  candidateTurnCount: number;
  maxCandidateTurns: number;
}): string {
  const sections: string[] = [];

  if (opts.isOpening) {
    sections.push(
      "SESSION STATE: First turn. No transcript yet. Open the interview by posing a clear, well-scoped problem appropriate for this mode."
    );
  } else {
    sections.push(
      `SESSION STATE: Turn ${opts.candidateTurnCount + 1}. Soft cap is ${opts.maxCandidateTurns} candidate turns. ${
        opts.candidateTurnCount >= opts.maxCandidateTurns
          ? "Cap reached — wrap up this turn (set end_session=true)."
          : ""
      }`
    );
  }

  if (opts.transcript.length > 0) {
    sections.push("TRANSCRIPT SO FAR:");
    for (const turn of opts.transcript) {
      const label =
        turn.role === "interviewer"
          ? "INTERVIEWER"
          : turn.role === "candidate"
            ? "CANDIDATE"
            : "SYSTEM";
      sections.push(`[${label}] ${turn.content}`);
    }
  }

  if (opts.latestCodeSubmission) {
    const { code, runResult, testCases } = opts.latestCodeSubmission;
    sections.push("CANDIDATE JUST SUBMITTED CODE:");
    sections.push("```javascript\n" + code + "\n```");
    sections.push(
      `Test cases (${testCases.length}): ${testCases
        .map((t) => `${t.name}${t.hidden ? " [hidden]" : ""}`)
        .join(", ")}`
    );
    if (runResult) {
      if (runResult.fatal_error) {
        sections.push(`RUN RESULT: fatal error — ${runResult.fatal_error}`);
      } else {
        sections.push(
          `RUN RESULT: ${runResult.passed}/${runResult.total} passed in ${runResult.runtime_ms}ms.`
        );
        const failed = runResult.results.filter((r) => !r.passed);
        if (failed.length > 0) {
          sections.push(
            "FAILED TESTS (do NOT reveal expected/actual to the candidate; ask them to reason about it):"
          );
          for (const f of failed) {
            sections.push(
              `  - ${f.name}${f.hidden ? " [hidden]" : ""}: ${
                f.error ? `error=${f.error}` : `expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)}`
              }`
            );
          }
        }
      }
    }
  }

  if (opts.latestCandidateMessage && !opts.latestCodeSubmission) {
    sections.push(`CANDIDATE'S LATEST MESSAGE:\n${opts.latestCandidateMessage}`);
  }

  sections.push(
    "Respond with the JSON described in the system instruction. Stay in character."
  );

  return sections.join("\n\n");
}

/**
 * Build the final-report prompt. The full transcript + all code submissions
 * are passed in as a single document; the model returns the FinalReport JSON.
 */
export function buildFinalReportPrompt(opts: {
  persona: InterviewerPersona;
  transcript: ConversationTurn[];
  codeSubmissions: {
    prompt_turn_index: number;
    code: string;
    run_result: RunResult | null;
    test_cases: TestCase[];
  }[];
}): string {
  const lines: string[] = [];

  lines.push(
    `You are calibrating a Staff+ engineering interview report for a ${
      opts.persona === "dsa" ? "DSA coding" : "System Design"
    } round. The interview just ended. Be honest and calibrated — soft, encouraging scores destroy the value of this report.`
  );

  lines.push("\nFULL TRANSCRIPT:");
  for (const turn of opts.transcript) {
    const label =
      turn.role === "interviewer"
        ? "INTERVIEWER"
        : turn.role === "candidate"
          ? "CANDIDATE"
          : "SYSTEM";
    lines.push(`[${label}] ${turn.content}`);
  }

  if (opts.codeSubmissions.length > 0) {
    lines.push("\nCODE SUBMISSIONS:");
    for (const sub of opts.codeSubmissions) {
      lines.push(`\n--- After interviewer turn ${sub.prompt_turn_index} ---`);
      lines.push("```javascript\n" + sub.code + "\n```");
      if (sub.run_result) {
        if (sub.run_result.fatal_error) {
          lines.push(`Run: fatal error — ${sub.run_result.fatal_error}`);
        } else {
          lines.push(
            `Run: ${sub.run_result.passed}/${sub.run_result.total} passed`
          );
        }
      }
    }
  }

  lines.push(
    `\nProduce a final report as JSON ONLY (no markdown). Schema:
{
  "overall_score": <0-100 integer>,
  "verdict": "<strong_hire|hire|leaning_hire|no_hire|strong_no_hire>",
  "staff_rubric": {
    "technical_accuracy":      { "score": <0-5>, "feedback": "..." },
    "depth":                   { "score": <0-5>, "feedback": "..." },
    "communication_clarity":   { "score": <0-5>, "feedback": "..." },
    "tradeoff_awareness":      { "score": <0-5>, "feedback": "..." },
    "staff_level_signal":      { "score": <0-5>, "feedback": "..." },
    "operational_excellence":  { "score": <0-5>, "feedback": "..." },
    "influence_communication": { "score": <0-5>, "feedback": "..." }
  },
  "interview_rubric": {
    "question_coverage":       { "score": <0-5>, "feedback": "did they actually answer what was asked across turns" },
    "probe_depth_handling":    { "score": <0-5>, "feedback": "how well they handled follow-up probes" },
    "recovery_after_pushback": { "score": <0-5>, "feedback": "behavior after being challenged or after a failed test run" },
    "time_management":         { "score": <0-5>, "feedback": "did they pace themselves; bog-down vs forward progress" }
  },
  "highlight_moments": ["specific quoted/paraphrased moments where they showed staff signal"],
  "drop_off_moments":  ["specific moments where they lost the room or missed depth"],
  "improved_transcript": "A tightened, exemplar version of the candidate's side of the conversation in 6-12 sentences. Show what a strong staff answer would have sounded like."
}

CALIBRATION:
- Verdict mapping: strong_hire ≥ 85, hire 70-84, leaning_hire 60-69, no_hire 40-59, strong_no_hire < 40.
- Major factual errors cap overall_score at 50.
- Strong tech but no trade-offs/operational thinking caps at 65.
- For dimensions where the candidate did not demonstrate the behavior, score 0-2 — do NOT generously infer.
- For DSA: weight technical_accuracy + depth heavily; weigh whether code actually passed tests.
- For System Design: weight tradeoff_awareness + operational_excellence + influence_communication heavily.`
  );

  return lines.join("\n");
}
