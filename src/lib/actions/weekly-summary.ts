"use server";

import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { getModel, modelNameForTask } from "@/lib/ai/gemini";
import type { WeeklySummary } from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

/**
 * Monday of the week containing `date` (ISO YYYY-MM-DD).
 * We anchor on Monday because that's the conventional "week start" in most
 * non-US locales and matches how people naturally think about a learning week.
 */
function weekStart(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): Sun=0, Mon=1, ... Sat=6 — shift so Mon=0
  const dayOfWeek = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOfWeek);
  return d.toISOString().slice(0, 10);
}

/** Sunday (inclusive) of the same week. */
function weekEnd(weekStartDay: string): string {
  const d = new Date(weekStartDay + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Cheap, fast, non-cryptographic hash. We just need a stable fingerprint of
 * the inputs to know if the cached summary is still fresh.
 */
function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function stripFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return t;
}

interface NoteRow {
  id: string;
  day: string;
  content: string;
}
interface TodoRow {
  id: string;
  note_id: string;
  label: string;
  done: boolean;
  carried_from_note_id: string | null;
}

interface WeeklyInputs {
  weekStart: string;
  weekEnd: string;
  notes: NoteRow[];
  todos: TodoRow[];
}

async function loadWeekInputs(week: string): Promise<WeeklyInputs> {
  const supabase = await createClient();
  const userId = await getUserId();
  const end = weekEnd(week);

  const { data: notes } = await supabase
    .from("notes")
    .select("id, day, content")
    .eq("user_id", userId)
    .gte("day", week)
    .lte("day", end)
    .order("day", { ascending: true });

  const noteRows = (notes ?? []) as NoteRow[];
  let todos: TodoRow[] = [];
  if (noteRows.length > 0) {
    const noteIds = noteRows.map((n) => n.id);
    const { data: todoRows } = await supabase
      .from("note_todos")
      .select("id, note_id, label, done, carried_from_note_id")
      .in("note_id", noteIds);
    todos = (todoRows ?? []) as TodoRow[];
  }

  return { weekStart: week, weekEnd: end, notes: noteRows, todos };
}

function buildPrompt(inputs: WeeklyInputs): string {
  const lines: string[] = [];
  lines.push(
    `You are summarizing a learning journal for the week of ${inputs.weekStart} to ${inputs.weekEnd}. Produce a tight, useful, slightly opinionated digest — not a generic recap.`
  );

  if (inputs.notes.length === 0) {
    lines.push("(The user logged no notes this week.)");
  } else {
    lines.push("\nDAILY NOTES:");
    for (const n of inputs.notes) {
      const dayTodos = inputs.todos.filter((t) => t.note_id === n.id);
      const open = dayTodos.filter((t) => !t.done);
      const done = dayTodos.filter((t) => t.done);
      lines.push(`\n[${n.day}]`);
      if (n.content.trim()) lines.push(n.content.trim());
      if (done.length > 0) {
        lines.push(`Done: ${done.map((t) => t.label).join("; ")}`);
      }
      if (open.length > 0) {
        lines.push(`Open: ${open.map((t) => t.label).join("; ")}`);
      }
    }
  }

  lines.push(
    `\nReturn ONLY this JSON, no markdown:
{
  "headline": "<one short sentence capturing the week's character — max 12 words>",
  "themes": [
    { "title": "<2-5 word theme>", "detail": "<one specific sentence about what they actually wrote, not generic>" }
  ],
  "suggestion": "<one specific next-step suggestion grounded in their week, max 25 words>"
}

Rules:
- 2–4 themes, ranked by how much weight they got in the notes.
- Themes must reference SPECIFIC things from the notes, not generic platitudes.
- If the week is empty/sparse, headline should reflect that honestly ("Quiet week — only 2 notes") and suggestion should nudge to log more.
- Suggestion must be concrete and actionable, not "keep going" — e.g. "Carry 'finish DDIA chapter 5' into Monday and time-box it to 45 min."`
  );

  return lines.join("\n");
}

function parseSummary(text: string): Partial<WeeklySummary> | null {
  try {
    return JSON.parse(stripFence(text));
  } catch {
    return null;
  }
}

interface GetSummaryResult {
  success: boolean;
  summary?: WeeklySummary;
  /** True when the cached value was returned without a Gemini call. */
  fromCache?: boolean;
  weekStart?: string;
  error?: string;
}

/**
 * Get the weekly summary for the week containing `referenceDate` (defaults to
 * today). Caches in the `notes_weekly_summaries` table keyed on (user, week_start).
 *
 * Cache invalidation: we recompute when the inputs hash changes, which only
 * happens for the *current* week (past weeks are immutable in practice).
 */
export async function getWeeklySummary(opts: {
  referenceDate?: string; // YYYY-MM-DD
  /** Force re-generation even if cached. */
  force?: boolean;
} = {}): Promise<GetSummaryResult> {
  const ref = opts.referenceDate
    ? new Date(opts.referenceDate + "T00:00:00")
    : new Date();
  const weekStartDay = weekStart(ref);

  const inputs = await loadWeekInputs(weekStartDay);
  const inputsHash = hashString(
    JSON.stringify({
      n: inputs.notes.map((n) => [n.id, n.content.length]),
      t: inputs.todos.map((t) => [t.id, t.done]),
    })
  );

  const supabase = await createClient();
  const userId = await getUserId();

  if (!opts.force) {
    const { data: cached } = await supabase
      .from("notes_weekly_summaries")
      .select("summary, inputs_hash, model_used")
      .eq("user_id", userId)
      .eq("week_start", weekStartDay)
      .maybeSingle();
    if (cached && cached.inputs_hash === inputsHash) {
      const summary = cached.summary as WeeklySummary;
      summary.model_used = (cached.model_used as string | null) ?? summary.model_used;
      return { success: true, summary, fromCache: true, weekStart: weekStartDay };
    }
  }

  // Compute counts up-front; we always know these without the AI.
  const todosDone = inputs.todos.filter((t) => t.done).length;
  const todosCarried = inputs.todos.filter((t) => !!t.carried_from_note_id).length;
  const daysLogged = inputs.notes.filter((n) => n.content.trim().length > 0 || inputs.todos.some((t) => t.note_id === n.id)).length;

  // Empty week: skip the AI call and return a deterministic short payload.
  if (inputs.notes.length === 0) {
    const empty: WeeklySummary = {
      headline: "Quiet week — no notes yet.",
      themes: [],
      todos_done: 0,
      todos_carried: 0,
      days_logged: 0,
      suggestion: "Open today's note and capture one thing you're learning right now.",
    };
    return { success: true, summary: empty, fromCache: false, weekStart: weekStartDay };
  }

  let model;
  try {
    model = getModel("weekly_notes_summary", { json: true, temperature: 0.4 });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI not configured",
    };
  }

  let parsed: Partial<WeeklySummary> | null = null;
  try {
    const result = await model.generateContent(buildPrompt(inputs));
    parsed = parseSummary(result.response.text());
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI request failed",
    };
  }

  if (!parsed || typeof parsed.headline !== "string") {
    return { success: false, error: "Could not parse AI summary" };
  }

  const summary: WeeklySummary = {
    headline: parsed.headline,
    themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 4) : [],
    suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
    todos_done: todosDone,
    todos_carried: todosCarried,
    days_logged: daysLogged,
    model_used: modelNameForTask("weekly_notes_summary"),
  };

  await supabase.from("notes_weekly_summaries").upsert(
    {
      user_id: userId,
      week_start: weekStartDay,
      summary,
      inputs_hash: inputsHash,
      model_used: summary.model_used ?? null,
    },
    { onConflict: "user_id,week_start" }
  );

  return { success: true, summary, fromCache: false, weekStart: weekStartDay };
}
