"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import type { MockInterviewMode } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

export async function startMockInterview(mode: MockInterviewMode, timeMinutes: number, questionCount: number) {
  const supabase = await createClient();
  const userId = await getUserId();

  // Fetch random cards based on mode
  let cards;
  if (mode === "mixed") {
    const { data } = await supabase
      .from("cards")
      .select("id")
      .order("created_at", { ascending: false });
    cards = data;
  } else if (mode === "behavioral") {
    const { data } = await supabase
      .from("cards")
      .select("id, entries!inner(category)")
      .in("entries.category", ["concepts", "system_design"]);
    cards = data;
  } else {
    const categoryMap: Record<string, string[]> = {
      dsa: ["dsa"],
      system_design: ["system_design", "backend"],
    };
    const categories = categoryMap[mode] || [mode];
    const { data } = await supabase
      .from("cards")
      .select("id, entries!inner(category)")
      .in("entries.category", categories);
    cards = data;
  }

  if (!cards || cards.length === 0) {
    return { success: false, error: "No cards available for this mode" };
  }

  // Shuffle and pick questionCount cards
  const shuffled = cards.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));

  // Create mock interview session
  const { data: interview, error } = await supabase
    .from("mock_interviews")
    .insert({
      user_id: userId,
      mode,
      time_limit_minutes: timeMinutes,
      total_questions: selected.length,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Insert questions in order
  const questions = selected.map((card, idx) => ({
    mock_interview_id: interview.id,
    card_id: card.id,
    question_order: idx + 1,
  }));

  const { error: qError } = await supabase
    .from("mock_interview_questions")
    .insert(questions);

  if (qError) return { success: false, error: qError.message };

  return { success: true, interviewId: interview.id };
}

export async function getMockInterview(id: string) {
  const supabase = await createClient();

  const { data: interview, error } = await supabase
    .from("mock_interviews")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return interview;
}

export async function getMockInterviewQuestions(interviewId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mock_interview_questions")
    .select("*, cards(id, question_type, question, options, answer)")
    .eq("mock_interview_id", interviewId)
    .order("question_order", { ascending: true });

  if (error) return [];
  return data;
}

export async function answerMockQuestion(
  questionId: string,
  data: {
    user_answer: string;
    explanation?: string;
    is_correct: boolean;
    time_taken_seconds: number;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("mock_interview_questions")
    .update({
      user_answer: data.user_answer,
      explanation: data.explanation || null,
      is_correct: data.is_correct,
      time_taken_seconds: data.time_taken_seconds,
      answered_at: new Date().toISOString(),
    })
    .eq("id", questionId);

  if (error) return { success: false, error: error.message };

  // Update interview progress
  const { data: question } = await supabase
    .from("mock_interview_questions")
    .select("mock_interview_id")
    .eq("id", questionId)
    .single();

  if (question) {
    const { data: allQuestions } = await supabase
      .from("mock_interview_questions")
      .select("is_correct")
      .eq("mock_interview_id", question.mock_interview_id)
      .not("answered_at", "is", null);

    const answered = allQuestions?.length || 0;
    const correct = allQuestions?.filter((q) => q.is_correct).length || 0;

    await supabase
      .from("mock_interviews")
      .update({
        questions_answered: answered,
        correct_count: correct,
      })
      .eq("id", question.mock_interview_id);
  }

  return { success: true };
}

export async function completeMockInterview(interviewId: string) {
  const supabase = await createClient();

  const { data: interview } = await supabase
    .from("mock_interviews")
    .select("total_questions, questions_answered, correct_count")
    .eq("id", interviewId)
    .single();

  if (!interview) return { success: false };

  const scorePercent = interview.questions_answered > 0
    ? Math.round((interview.correct_count / interview.questions_answered) * 100)
    : 0;

  const { error } = await supabase
    .from("mock_interviews")
    .update({
      status: "completed",
      score_percent: scorePercent,
      completed_at: new Date().toISOString(),
    })
    .eq("id", interviewId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/mock-interview");
  return { success: true, scorePercent };
}

export async function abandonMockInterview(interviewId: string) {
  const supabase = await createClient();

  await supabase
    .from("mock_interviews")
    .update({ status: "abandoned", completed_at: new Date().toISOString() })
    .eq("id", interviewId);

  revalidatePath("/mock-interview");
}

export async function getRecentMockInterviews(limit = 10) {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("mock_interviews")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data;
}
