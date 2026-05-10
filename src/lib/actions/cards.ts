"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { embedText, toPgvector } from "@/lib/ai/embeddings";
import type { QuestionType } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

export async function getCardsForEntry(entryId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getDueCards() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .lte("due", new Date().toISOString())
    .order("due", { ascending: true });

  if (error) throw error;
  return data;
}

export async function getCardsByCategory(category: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select("*, entries!inner(category)")
    .eq("entries.category", category);

  if (error) throw error;
  return data;
}

export async function getAllCards() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function createCard(formData: {
  entry_id: string;
  question_type: QuestionType;
  question: string;
  options: { text: string; isCorrect: boolean }[] | null;
  answer: string;
}) {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: userId,
      entry_id: formData.entry_id,
      question_type: formData.question_type,
      question: formData.question,
      options: formData.options,
      answer: formData.answer,
    })
    .select()
    .single();

  if (error) throw error;

  // Best-effort question embedding so manually-created cards participate in
  // the same dedup + future semantic features as AI-generated ones.
  void (async () => {
    try {
      const vector = await embedText(formData.question, "document");
      if (!vector) return;
      await supabase
        .from("cards")
        .update({ question_embedding: toPgvector(vector) })
        .eq("id", data.id);
    } catch (err) {
      console.warn("[cards] embedding refresh failed:", err);
    }
  })();

  revalidatePath(`/entries/${formData.entry_id}`);
  return data;
}

export async function deleteCard(id: string, entryId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("cards").delete().eq("id", id);

  if (error) throw error;

  revalidatePath(`/entries/${entryId}`);
}

export async function updateCardSchedule(
  cardId: string,
  scheduleData: {
    stability: number;
    difficulty_score: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    due: string;
    last_review: string;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("cards")
    .update(scheduleData)
    .eq("id", cardId);

  if (error) throw error;
}
