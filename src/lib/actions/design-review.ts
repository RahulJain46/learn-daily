"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { getModel, modelNameForTask } from "@/lib/ai/gemini";
import {
  buildReviewPrompt,
  buildQAEvalPrompt,
  diagramToPromptText,
  isValidReport,
} from "@/lib/ai/design-review-prompt";
import type {
  Diagram,
  DesignReviewReport,
  DesignQATurn,
  DesignQAEvaluation,
  SystemDesignReview,
} from "@/lib/types";

async function getUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

function stripJsonFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return t;
}

// ---------------------------------------------------------------------------
// Create / load
// ---------------------------------------------------------------------------

interface CreateReviewInput {
  problemTitle: string;
  problemBrief: string;
  problemTemplate?: string | null;
}

interface CreateReviewResult {
  success: boolean;
  reviewId?: string;
  error?: string;
}

/** Create a draft review with the chosen problem and an empty diagram. */
export async function createReview(
  input: CreateReviewInput
): Promise<CreateReviewResult> {
  if (!input.problemTitle.trim() || !input.problemBrief.trim()) {
    return { success: false, error: "Problem title and brief are required" };
  }

  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("system_design_reviews")
    .insert({
      user_id: userId,
      problem_title: input.problemTitle.trim(),
      problem_brief: input.problemBrief.trim(),
      problem_template: input.problemTemplate ?? null,
      diagram: { nodes: [], edges: [] },
      qa_thread: [],
      status: "draft",
    })
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create review" };
  }

  revalidatePath("/design-review");
  return { success: true, reviewId: data.id };
}

export async function getReview(
  reviewId: string
): Promise<SystemDesignReview | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("system_design_reviews")
    .select("*")
    .eq("id", reviewId)
    .single();
  return (data as SystemDesignReview | null) ?? null;
}

export async function listReviews(): Promise<SystemDesignReview[]> {
  const supabase = await createClient();
  const userId = await getUserId();
  const { data } = await supabase
    .from("system_design_reviews")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data as SystemDesignReview[] | null) ?? [];
}

// ---------------------------------------------------------------------------
// Save diagram (autosave / on-leave)
// ---------------------------------------------------------------------------

export async function saveDiagram(
  reviewId: string,
  diagram: Diagram
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("system_design_reviews")
    .update({ diagram })
    .eq("id", reviewId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Submit for AI critique
// ---------------------------------------------------------------------------

interface SubmitDesignResult {
  success: boolean;
  report?: DesignReviewReport;
  error?: string;
}

/**
 * Persist the current diagram and run the critique. On success the review
 * status flips to 'reviewed' and the report becomes visible.
 *
 * Re-running on an already-reviewed row replaces the report and clears the
 * Q&A thread (the questions are tied to the previous report).
 */
export async function submitForReview(
  reviewId: string,
  diagram: Diagram
): Promise<SubmitDesignResult> {
  const supabase = await createClient();
  const { data: review, error: loadErr } = await supabase
    .from("system_design_reviews")
    .select("*")
    .eq("id", reviewId)
    .single();

  if (loadErr || !review) {
    return { success: false, error: loadErr?.message ?? "Review not found" };
  }

  if (diagram.nodes.length < 2) {
    return {
      success: false,
      error: "Add at least 2 components and one connection before submitting.",
    };
  }
  if (diagram.edges.length === 0) {
    return {
      success: false,
      error: "Connect your components — an architecture without edges can't be evaluated.",
    };
  }

  let model;
  try {
    model = getModel("system_design_review", { json: true, temperature: 0.4 });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI not configured",
    };
  }

  const prompt = buildReviewPrompt({
    problemTitle: review.problem_title,
    problemBrief: review.problem_brief,
    diagram,
  });

  let report: DesignReviewReport | null = null;
  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(stripJsonFence(result.response.text())) as unknown;
    if (isValidReport(parsed)) {
      report = parsed;
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }

  if (!report) {
    return { success: false, error: "AI returned an unparseable critique" };
  }

  report.model_used = modelNameForTask("system_design_review");

  const { error: saveErr } = await supabase
    .from("system_design_reviews")
    .update({
      diagram,
      report,
      qa_thread: [],
      status: "reviewed",
    })
    .eq("id", reviewId);

  if (saveErr) {
    return { success: false, error: saveErr.message };
  }

  revalidatePath(`/design-review/${reviewId}`);
  revalidatePath("/design-review");
  return { success: true, report };
}

// ---------------------------------------------------------------------------
// Follow-up Q&A
// ---------------------------------------------------------------------------

interface AnswerFollowUpInput {
  reviewId: string;
  questionId: string;
  answer: string;
}

interface AnswerFollowUpResult {
  success: boolean;
  evaluation?: DesignQAEvaluation;
  turn?: DesignQATurn;
  error?: string;
}

/**
 * Score the candidate's answer to one of the report's follow-up questions.
 * Appends the turn to qa_thread (or replaces a prior turn for the same
 * question_id, since users are allowed to retry).
 */
export async function answerFollowUp(
  input: AnswerFollowUpInput
): Promise<AnswerFollowUpResult> {
  if (!input.answer.trim()) {
    return { success: false, error: "Answer cannot be empty" };
  }

  const supabase = await createClient();
  const { data: review } = await supabase
    .from("system_design_reviews")
    .select("*")
    .eq("id", input.reviewId)
    .single();

  if (!review) return { success: false, error: "Review not found" };
  const report = review.report as DesignReviewReport | null;
  if (!report) {
    return {
      success: false,
      error: "Submit your design for review before answering follow-ups",
    };
  }

  const question = report.follow_up_questions.find((q) => q.id === input.questionId);
  if (!question) {
    return { success: false, error: "Unknown follow-up question" };
  }

  const priorThread = (review.qa_thread as DesignQATurn[] | null) ?? [];
  // Keep prior turns BUT drop any earlier answer to this same question — the
  // most recent attempt wins.
  const filteredPrior = priorThread.filter((t) => t.question_id !== input.questionId);

  let model;
  try {
    model = getModel("system_design_qa", { json: true, temperature: 0.3 });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI not configured",
    };
  }

  const prompt = buildQAEvalPrompt({
    problemTitle: review.problem_title,
    problemBrief: review.problem_brief,
    diagramText: diagramToPromptText(review.diagram as Diagram),
    question,
    userAnswer: input.answer,
    priorTurns: filteredPrior,
  });

  let evaluation: DesignQAEvaluation | null = null;
  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(stripJsonFence(result.response.text())) as {
      score?: unknown;
      feedback?: unknown;
      follow_up?: unknown;
    };
    if (
      typeof parsed.score === "number" &&
      typeof parsed.feedback === "string"
    ) {
      evaluation = {
        score: Math.max(0, Math.min(5, parsed.score)),
        feedback: parsed.feedback,
        follow_up:
          typeof parsed.follow_up === "string" && parsed.follow_up.trim()
            ? parsed.follow_up
            : undefined,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }

  if (!evaluation) {
    return { success: false, error: "AI returned an unparseable evaluation" };
  }

  const turn: DesignQATurn = {
    id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    question_id: input.questionId,
    question: question.question,
    user_answer: input.answer,
    ai_evaluation: evaluation,
    answered_at: new Date().toISOString(),
  };

  const newThread = [...filteredPrior, turn];

  const { error: saveErr } = await supabase
    .from("system_design_reviews")
    .update({ qa_thread: newThread })
    .eq("id", input.reviewId);

  if (saveErr) {
    return { success: false, error: saveErr.message };
  }

  revalidatePath(`/design-review/${input.reviewId}`);
  return { success: true, evaluation, turn };
}

// ---------------------------------------------------------------------------
// Delete / archive
// ---------------------------------------------------------------------------

export async function archiveReview(reviewId: string) {
  const supabase = await createClient();
  await supabase
    .from("system_design_reviews")
    .update({ status: "archived" })
    .eq("id", reviewId);
  revalidatePath("/design-review");
}
