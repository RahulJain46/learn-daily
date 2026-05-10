"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import type { InterviewLogStatus } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

export async function getInterviewLogs() {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("interview_log")
    .select("*")
    .eq("user_id", userId)
    .order("interview_date", { ascending: false });

  if (error) return [];
  return data;
}

export async function getInterviewLog(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interview_log")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createInterviewLog(formData: {
  company: string;
  role: string;
  interview_date?: string;
  status: InterviewLogStatus;
  topics: string[];
  notes?: string;
}) {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("interview_log")
    .insert({
      user_id: userId,
      company: formData.company,
      role: formData.role,
      interview_date: formData.interview_date || null,
      status: formData.status,
      topics: formData.topics,
      notes: formData.notes || null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/interviews");
  return { success: true, data };
}

export async function updateInterviewLog(
  id: string,
  formData: {
    company?: string;
    role?: string;
    interview_date?: string;
    status?: InterviewLogStatus;
    topics?: string[];
    notes?: string;
    reflection?: string;
    difficulty?: string;
    result_rating?: number;
  }
) {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (formData.company !== undefined) updateData.company = formData.company;
  if (formData.role !== undefined) updateData.role = formData.role;
  if (formData.interview_date !== undefined) updateData.interview_date = formData.interview_date || null;
  if (formData.status !== undefined) updateData.status = formData.status;
  if (formData.topics !== undefined) updateData.topics = formData.topics;
  if (formData.notes !== undefined) updateData.notes = formData.notes || null;
  if (formData.reflection !== undefined) updateData.reflection = formData.reflection || null;
  if (formData.difficulty !== undefined) updateData.difficulty = formData.difficulty || null;
  if (formData.result_rating !== undefined) updateData.result_rating = formData.result_rating || null;

  const { error } = await supabase
    .from("interview_log")
    .update(updateData)
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/interviews");
  revalidatePath(`/interviews/${id}`);
  return { success: true };
}

export async function deleteInterviewLog(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("interview_log")
    .delete()
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/interviews");
  return { success: true };
}

export async function getUpcomingInterviews() {
  const supabase = await createClient();
  const userId = await getUserId();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("interview_log")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "upcoming")
    .gte("interview_date", today)
    .order("interview_date", { ascending: true });

  if (error) return [];
  return data;
}
