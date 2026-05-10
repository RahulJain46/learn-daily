import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Centralised Gemini model selection.
 *
 * We're on the Gemini API **free tier**, which excludes the entire Gemini 3
 * Pro/Flash lineup (paid only). The free-tier-eligible models that fit this
 * app are:
 *   - gemini-2.5-flash            (10 RPM / 250k TPM / 250 RPD)
 *   - gemini-2.5-flash-lite       (30 RPM / 1M TPM / 1000 RPD)
 *   - gemini-3.1-flash-lite-preview (frontier-class reasoning, free-tier)
 *
 * Routing strategy:
 *   - High-volume, bounded JSON         -> 2.5-flash / 2.5-flash-lite
 *   - Quality-sensitive ex-Pro tasks    -> 3.1-flash-lite-preview
 *
 * When we move to paid tier, swap the deep tasks back to
 * `gemini-3.1-pro-preview` and the standard tasks to `gemini-3-flash-preview`.
 */
export type AiTask =
  | "card_generation"
  | "card_generation_deep"
  | "answer_eval_standard"
  | "answer_eval_deep"
  | "quick_quiz"
  | "mock_interview_followup"
  | "coaching_summary"
  | "weekly_notes_summary"
  | "gap_analysis"
  | "system_design_review"
  | "system_design_qa";

// Free-tier model routing. See header comment for the rationale and the
// upgrade path when billing is enabled.
// Source: https://ai.google.dev/gemini-api/docs/models
const MODEL_FOR_TASK: Record<AiTask, string> = {
  // Bounded JSON, batched generation — needs daily volume + decent quality
  card_generation: "gemini-2.5-flash",

  // Cheap, high-volume single-question tasks — Flash-Lite has the most RPD
  quick_quiz: "gemini-2.5-flash-lite",
  coaching_summary: "gemini-2.5-flash-lite",
  answer_eval_standard: "gemini-2.5-flash-lite",

  // Quality-sensitive tasks that previously routed to Pro. On free tier the
  // best available substitute is Gemini 3.1 Flash-Lite Preview.
  card_generation_deep: "gemini-2.5-flash",
  answer_eval_deep: "gemini-3.1-flash-lite-preview",
  mock_interview_followup: "gemini-3.1-flash-lite-preview",

  // Weekly digest of daily notes — short prompt, structured JSON, runs once
  // per week per user. Flash-Lite is plenty.
  weekly_notes_summary: "gemini-2.5-flash-lite",

  // Knowledge Gap Analyzer synthesises performance signals across the whole
  // app into a prioritised plan. Input is large (rubrics + transcripts) and
  // output quality directly drives the user's study direction, so we use the
  // strongest free-tier reasoning model.
  gap_analysis: "gemini-3.1-flash-lite-preview",

  // System Design Review judges a hand-drawn architecture against a Staff+
  // rubric and writes Socratic follow-up questions. Quality matters a lot
  // here — a sloppy critique trains bad instincts — so route to the
  // strongest free-tier reasoning model.
  system_design_review: "gemini-3.1-flash-lite-preview",

  // Per-question Q&A scoring after the report is generated. Smaller input,
  // tighter output — Flash-Lite is enough.
  system_design_qa: "gemini-2.5-flash-lite",
};

interface GetModelOpts {
  json?: boolean;
  temperature?: number;
  /**
   * Optional system instruction (persona / role definition). Persistent across
   * the model session — call sites for the conversational interviewer pass
   * the persona prompt here so it doesn't pollute every user message.
   */
  systemInstruction?: string;
}

/**
 * Returns a configured Gemini model for the given task.
 * Throws if GEMINI_API_KEY is missing (call sites should surface this gracefully).
 */
export function getModel(task: AiTask, opts: GetModelOpts = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: MODEL_FOR_TASK[task],
    ...(opts.systemInstruction && { systemInstruction: opts.systemInstruction }),
    generationConfig: {
      ...(opts.json && { responseMimeType: "application/json" }),
      ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    },
  });
}

/**
 * Decides whether an answer evaluation deserves the deep (Pro) model.
 *
 * Deep model is used when calibrated staff-level grading is meaningful:
 *   - long-form short_answer responses, AND
 *   - either a hard difficulty OR a category where trade-off / depth matters
 *
 * Everything else (MCQ, flashcards, easy/medium recall) gets Flash.
 */
export function pickEvalModel(input: {
  questionType: "short_answer" | "flashcard" | "mcq";
  category?: string | null;
  difficulty?: string | null;
}): Extract<AiTask, "answer_eval_standard" | "answer_eval_deep"> {
  if (input.questionType !== "short_answer") {
    return "answer_eval_standard";
  }

  const deepCategories = new Set(["system_design", "concepts", "ai"]);
  const isHard = input.difficulty === "hard";
  const isDeepCategory = !!input.category && deepCategories.has(input.category);

  return isHard || isDeepCategory ? "answer_eval_deep" : "answer_eval_standard";
}

/** Exposed for diagnostics / debug surfacing in the UI. */
export function modelNameForTask(task: AiTask): string {
  return MODEL_FOR_TASK[task];
}
