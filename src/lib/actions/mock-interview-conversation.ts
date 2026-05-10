"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { getModel, modelNameForTask } from "@/lib/ai/gemini";
import {
  buildInterviewerSystemInstruction,
  buildInterviewerUserPrompt,
  buildFinalReportPrompt,
  type InterviewerPersona,
  type InterviewerStructuredResponse,
} from "@/lib/ai/interviewer-prompt";
import {
  CONVERSATIONAL_INTERVIEW_CONFIG,
  type ConversationTurn,
  type FinalReport,
  type RunResult,
  type TestCase,
} from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isConversationalPersona(mode: string): mode is InterviewerPersona {
  return mode === "dsa" || mode === "system_design";
}

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return t;
}

function parseStructuredTurn(
  text: string
): InterviewerStructuredResponse | null {
  try {
    const cleaned = stripJsonFence(text);
    const parsed = JSON.parse(cleaned) as InterviewerStructuredResponse;
    if (typeof parsed.message !== "string" || !parsed.message.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseFinalReport(text: string): FinalReport | null {
  try {
    const cleaned = stripJsonFence(text);
    const parsed = JSON.parse(cleaned) as FinalReport;
    if (
      typeof parsed.overall_score !== "number" ||
      !parsed.verdict ||
      !parsed.staff_rubric ||
      !parsed.interview_rubric
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function loadTranscript(
  interviewId: string
): Promise<ConversationTurn[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mock_interview_turns")
    .select("*")
    .eq("mock_interview_id", interviewId)
    .order("turn_index", { ascending: true });
  return (data ?? []) as ConversationTurn[];
}

async function nextTurnIndex(interviewId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mock_interview_turns")
    .select("turn_index")
    .eq("mock_interview_id", interviewId)
    .order("turn_index", { ascending: false })
    .limit(1);
  return (data?.[0]?.turn_index ?? -1) + 1;
}

async function insertTurn(opts: {
  interviewId: string;
  role: "interviewer" | "candidate" | "system";
  content: string;
  perTurnSignal?: InterviewerStructuredResponse["per_turn_signal"] | null;
  codeSubmissionId?: string | null;
}): Promise<ConversationTurn | null> {
  const supabase = await createClient();
  const turnIndex = await nextTurnIndex(opts.interviewId);
  const { data } = await supabase
    .from("mock_interview_turns")
    .insert({
      mock_interview_id: opts.interviewId,
      turn_index: turnIndex,
      role: opts.role,
      content: opts.content,
      per_turn_signal: opts.perTurnSignal ?? null,
      code_submission_id: opts.codeSubmissionId ?? null,
    })
    .select()
    .single();
  return (data ?? null) as ConversationTurn | null;
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

interface StartConversationResult {
  success: boolean;
  interviewId?: string;
  openingTurn?: ConversationTurn;
  error?: string;
}

/**
 * Start a new conversational mock interview. Creates the row, asks the
 * interviewer model for an opening question, and persists it as turn 0.
 */
export async function startConversation(
  mode: InterviewerPersona
): Promise<StartConversationResult> {
  if (!isConversationalPersona(mode)) {
    return { success: false, error: "Unsupported mode for conversational interview" };
  }

  const supabase = await createClient();
  const userId = await getUserId();
  const config = CONVERSATIONAL_INTERVIEW_CONFIG[mode];

  // Create the interview row first so the opening turn can reference it.
  const { data: interview, error } = await supabase
    .from("mock_interviews")
    .insert({
      user_id: userId,
      mode,
      // Conversational sessions don't use the legacy time/question caps but
      // the columns are NOT NULL, so we set sensible defaults.
      time_limit_minutes: mode === "dsa" ? 45 : 60,
      total_questions: config.maxCandidateTurns,
      conversation_mode: true,
      interviewer_persona: mode,
    })
    .select()
    .single();

  if (error || !interview) {
    return {
      success: false,
      error: error?.message ?? "Failed to create interview session",
    };
  }

  // Ask the model for the opening question.
  let model;
  try {
    model = getModel("mock_interview_followup", {
      json: true,
      temperature: 0.6,
      systemInstruction: buildInterviewerSystemInstruction(
        mode,
        config.maxCandidateTurns
      ),
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI not configured",
    };
  }

  const userPrompt = buildInterviewerUserPrompt({
    transcript: [],
    isOpening: true,
    candidateTurnCount: 0,
    maxCandidateTurns: config.maxCandidateTurns,
  });

  let parsed: InterviewerStructuredResponse | null = null;
  try {
    const result = await model.generateContent(userPrompt);
    parsed = parseStructuredTurn(result.response.text());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }

  if (!parsed) {
    return {
      success: false,
      error: "Interviewer returned an unparseable opening response",
    };
  }

  const openingTurn = await insertTurn({
    interviewId: interview.id,
    role: "interviewer",
    content: parsed.message,
    perTurnSignal: parsed.per_turn_signal ?? null,
  });

  return {
    success: true,
    interviewId: interview.id,
    openingTurn: openingTurn ?? undefined,
  };
}

interface SendTurnInput {
  interviewId: string;
  candidateMessage?: string;
  /**
   * If the candidate just ran code, pass the submission ID. The action
   * will fetch the submission + run results and feed them into the prompt.
   */
  codeSubmissionId?: string;
}

interface SendTurnResult {
  success: boolean;
  candidateTurn?: ConversationTurn;
  interviewerTurn?: ConversationTurn;
  /** True when the model signalled end_session — UI should call finishConversation. */
  shouldFinish?: boolean;
  error?: string;
}

/**
 * Append a candidate turn (text and/or code submission) and ask the
 * interviewer for the next response.
 */
export async function sendTurn(input: SendTurnInput): Promise<SendTurnResult> {
  if (!input.candidateMessage?.trim() && !input.codeSubmissionId) {
    return { success: false, error: "Empty turn — provide a message or code submission" };
  }

  const supabase = await createClient();
  const { data: interview } = await supabase
    .from("mock_interviews")
    .select("*")
    .eq("id", input.interviewId)
    .single();

  if (!interview) return { success: false, error: "Interview not found" };
  if (interview.status !== "in_progress") {
    return { success: false, error: "Interview is no longer active" };
  }
  if (!interview.conversation_mode) {
    return { success: false, error: "This interview is not conversational" };
  }
  const persona: InterviewerPersona | null = isConversationalPersona(interview.mode)
    ? interview.mode
    : null;
  if (!persona) {
    return { success: false, error: "Unsupported mode" };
  }

  const config = CONVERSATIONAL_INTERVIEW_CONFIG[persona];

  // Optionally hydrate the latest code submission for the prompt.
  let latestCode:
    | { code: string; runResult: RunResult | null; testCases: TestCase[] }
    | undefined;
  if (input.codeSubmissionId) {
    const { data: sub } = await supabase
      .from("mock_interview_code_submissions")
      .select("*")
      .eq("id", input.codeSubmissionId)
      .single();
    if (sub) {
      latestCode = {
        code: sub.code,
        runResult: sub.run_result as RunResult | null,
        testCases: (sub.test_cases as TestCase[]) ?? [],
      };
    }
  }

  // Persist the candidate turn first so it shows up in the transcript even if
  // the model call fails afterwards.
  const candidateContent =
    input.candidateMessage?.trim() ||
    (latestCode ? "[submitted code — see editor panel]" : "");

  const candidateTurn = await insertTurn({
    interviewId: input.interviewId,
    role: "candidate",
    content: candidateContent,
    codeSubmissionId: input.codeSubmissionId ?? null,
  });
  if (!candidateTurn) {
    return { success: false, error: "Failed to record candidate turn" };
  }

  const transcript = await loadTranscript(input.interviewId);
  const candidateTurnCount = transcript.filter(
    (t) => t.role === "candidate"
  ).length;

  // Ask the interviewer for the next turn.
  let model;
  try {
    model = getModel("mock_interview_followup", {
      json: true,
      temperature: 0.55,
      systemInstruction: buildInterviewerSystemInstruction(
        persona,
        config.maxCandidateTurns
      ),
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI not configured",
      candidateTurn,
    };
  }

  const userPrompt = buildInterviewerUserPrompt({
    transcript,
    latestCandidateMessage: input.candidateMessage,
    latestCodeSubmission: latestCode,
    isOpening: false,
    candidateTurnCount,
    maxCandidateTurns: config.maxCandidateTurns,
  });

  let parsed: InterviewerStructuredResponse | null = null;
  try {
    const result = await model.generateContent(userPrompt);
    parsed = parseStructuredTurn(result.response.text());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI request failed",
      candidateTurn,
    };
  }

  if (!parsed) {
    return {
      success: false,
      error: "Interviewer returned an unparseable response",
      candidateTurn,
    };
  }

  // For DSA: if the model requested code, validate test cases exist.
  // For System Design: ignore any rogue request_code (the persona forbids it,
  // but defense-in-depth — we never want the editor to pop up there).
  let messageToStore = parsed.message;
  if (persona === "system_design") {
    parsed.request_code = false;
    parsed.test_cases = undefined;
  } else if (parsed.request_code) {
    if (!parsed.test_cases || parsed.test_cases.length === 0) {
      // Model asked for code but didn't supply tests. We still proceed but
      // strip the request_code flag so the UI doesn't lock the editor with
      // no harness.
      parsed.request_code = false;
    }
  }

  // Embed the test cases in the turn content if the AI is asking for code,
  // so the UI can pick them up by reading the latest interviewer turn.
  if (parsed.request_code && parsed.test_cases) {
    messageToStore =
      parsed.message +
      "\n\n<!--CODE_REQUEST:" +
      JSON.stringify({ test_cases: parsed.test_cases }) +
      "-->";
  }

  const interviewerTurn = await insertTurn({
    interviewId: input.interviewId,
    role: "interviewer",
    content: messageToStore,
    perTurnSignal: parsed.per_turn_signal ?? null,
  });

  return {
    success: true,
    candidateTurn,
    interviewerTurn: interviewerTurn ?? undefined,
    shouldFinish:
      parsed.end_session === true ||
      candidateTurnCount >= config.maxCandidateTurns,
  };
}

interface SubmitCodeInput {
  interviewId: string;
  /** The interviewer turn that asked for code (turn_index). */
  promptTurnIndex: number;
  code: string;
  testCases: TestCase[];
  runResult: RunResult;
}

interface SubmitCodeResult {
  success: boolean;
  submissionId?: string;
  error?: string;
}

/**
 * Persist a code submission + its run results. The UI runs the harness in
 * the browser sandbox and posts the result here. We do NOT re-run server
 * side (no Node sandbox infrastructure on Vercel free tier).
 */
export async function submitCode(input: SubmitCodeInput): Promise<SubmitCodeResult> {
  const supabase = await createClient();
  const { data: interview } = await supabase
    .from("mock_interviews")
    .select("id, status, mode, conversation_mode")
    .eq("id", input.interviewId)
    .single();

  if (!interview) return { success: false, error: "Interview not found" };
  if (interview.status !== "in_progress") {
    return { success: false, error: "Interview is no longer active" };
  }
  if (!interview.conversation_mode || interview.mode !== "dsa") {
    return { success: false, error: "Code submissions only allowed in conversational DSA mode" };
  }

  const { data, error } = await supabase
    .from("mock_interview_code_submissions")
    .insert({
      mock_interview_id: input.interviewId,
      prompt_turn_index: input.promptTurnIndex,
      language: "javascript",
      code: input.code,
      test_cases: input.testCases,
      run_result: input.runResult,
    })
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to save submission" };
  }

  return { success: true, submissionId: data.id };
}

interface FinishConversationResult {
  success: boolean;
  report?: FinalReport;
  error?: string;
}

/**
 * Generate the final Staff+ report on the full transcript + all code submissions,
 * mark the interview completed, and return the report for the UI.
 */
export async function finishConversation(
  interviewId: string
): Promise<FinishConversationResult> {
  const supabase = await createClient();
  const { data: interview } = await supabase
    .from("mock_interviews")
    .select("*")
    .eq("id", interviewId)
    .single();

  if (!interview) return { success: false, error: "Interview not found" };
  if (!interview.conversation_mode) {
    return { success: false, error: "Not a conversational session" };
  }
  const persona: InterviewerPersona | null = isConversationalPersona(interview.mode)
    ? interview.mode
    : null;
  if (!persona) {
    return { success: false, error: "Unsupported mode" };
  }

  const transcript = await loadTranscript(interviewId);
  if (transcript.length === 0) {
    return { success: false, error: "No transcript to evaluate" };
  }

  const { data: submissions } = await supabase
    .from("mock_interview_code_submissions")
    .select("prompt_turn_index, code, run_result, test_cases")
    .eq("mock_interview_id", interviewId)
    .order("created_at", { ascending: true });

  let model;
  try {
    model = getModel("mock_interview_followup", {
      json: true,
      temperature: 0.3,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI not configured",
    };
  }

  const prompt = buildFinalReportPrompt({
    persona,
    transcript,
    codeSubmissions: (submissions ?? []) as {
      prompt_turn_index: number;
      code: string;
      run_result: RunResult | null;
      test_cases: TestCase[];
    }[],
  });

  let report: FinalReport | null = null;
  try {
    const result = await model.generateContent(prompt);
    report = parseFinalReport(result.response.text());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }

  if (!report) {
    return { success: false, error: "Failed to parse final report" };
  }

  report.model_used = modelNameForTask("mock_interview_followup");

  // Persist + close the session. We map verdict -> score_percent for the
  // listing UI so existing /mock-interview page badges still make sense.
  await supabase
    .from("mock_interviews")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      score_percent: report.overall_score,
      questions_answered: transcript.filter((t) => t.role === "candidate").length,
      final_report: report,
    })
    .eq("id", interviewId);

  revalidatePath("/mock-interview");
  return { success: true, report };
}

/**
 * Read-only fetch for the conversation page — used on resume and on the
 * final report screen.
 */
export async function getConversation(interviewId: string) {
  const supabase = await createClient();
  const [{ data: interview }, transcript, { data: submissions }] = await Promise.all([
    supabase.from("mock_interviews").select("*").eq("id", interviewId).single(),
    loadTranscript(interviewId),
    supabase
      .from("mock_interview_code_submissions")
      .select("*")
      .eq("mock_interview_id", interviewId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    interview,
    transcript,
    submissions: (submissions ?? []) as unknown[],
  };
}

/**
 * Mark a conversational interview as abandoned without running the report.
 */
export async function abandonConversation(interviewId: string) {
  const supabase = await createClient();
  await supabase
    .from("mock_interviews")
    .update({
      status: "abandoned",
      completed_at: new Date().toISOString(),
    })
    .eq("id", interviewId);
  revalidatePath("/mock-interview");
}
