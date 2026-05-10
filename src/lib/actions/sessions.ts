"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import type { Rating } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

export async function createRevisionSession(data: {
  mode: string;
  category?: string;
  cards_reviewed: number;
  correct_count: number;
  duration_seconds: number;
}) {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data: session, error } = await supabase
    .from("revision_sessions")
    .insert({
      user_id: userId,
      mode: data.mode,
      category: data.category || null,
      cards_reviewed: data.cards_reviewed,
      correct_count: data.correct_count,
      duration_seconds: data.duration_seconds,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/stats");
  return session;
}

export async function createCardReview(data: {
  session_id?: string;
  card_id: string;
  user_answer?: string;
  rating: Rating;
  time_taken_ms?: number;
}) {
  const supabase = await createClient();
  const userId = await getUserId();

  const { error } = await supabase.from("card_reviews").insert({
    user_id: userId,
    session_id: data.session_id || null,
    card_id: data.card_id,
    user_answer: data.user_answer || null,
    rating: data.rating,
    time_taken_ms: data.time_taken_ms || null,
  });

  if (error) throw error;
}

export async function getRecentSessions(limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revision_sessions")
    .select("*")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getStats() {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  const { count: totalEntries } = await supabase
    .from("entries")
    .select("*", { count: "exact", head: true });

  const { count: totalCards } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true });

  const { count: cardsDue } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .lte("due", new Date().toISOString());

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekSessions } = await supabase
    .from("revision_sessions")
    .select("cards_reviewed, correct_count")
    .gte("completed_at", weekAgo.toISOString());

  const reviewedThisWeek = weekSessions?.reduce((sum, s) => sum + s.cards_reviewed, 0) ?? 0;
  const correctThisWeek = weekSessions?.reduce((sum, s) => sum + s.correct_count, 0) ?? 0;

  return {
    streak: profile?.streak_count ?? 0,
    totalEntries: totalEntries ?? 0,
    totalCards: totalCards ?? 0,
    cardsDueToday: cardsDue ?? 0,
    reviewedThisWeek,
    correctThisWeek,
    accuracy: reviewedThisWeek > 0 ? Math.round((correctThisWeek / reviewedThisWeek) * 100) : 0,
  };
}

export async function updateStreak() {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data: profile } = await supabase
    .from("profiles")
    .select("streak_count, last_active_date")
    .eq("id", userId)
    .single();

  if (!profile) return;

  const today = new Date().toISOString().split("T")[0];
  const lastActive = profile.last_active_date;

  if (lastActive === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const newStreak = lastActive === yesterdayStr ? profile.streak_count + 1 : 1;

  await supabase
    .from("profiles")
    .update({
      streak_count: newStreak,
      last_active_date: today,
    })
    .eq("id", userId);
}
