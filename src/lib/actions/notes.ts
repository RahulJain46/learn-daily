"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { embedText, toPgvector } from "@/lib/ai/embeddings";
import type { Note, NoteTodo, NotesSearchHit } from "@/lib/types";

// ---------------------------------------------------------------------------
// Embedding throttle
// ---------------------------------------------------------------------------
//
// `updateNoteContent` runs on every debounced keystroke. We absolutely do
// NOT want to call Gemini that often — it would burn the free-tier quota in
// minutes and produce embeddings of half-typed sentences.
//
// Strategy: per-note in-memory throttle. We re-embed only if BOTH:
//   1. content has changed by >= EMBED_MIN_DELTA chars vs. the last embed
//   2. >= EMBED_MIN_INTERVAL_MS has elapsed since the last embed
//
// Memory footprint: one entry per active note id, cleared on server restart.
// That's fine — worst case after a restart is one extra embed per note when
// the user next saves. We intentionally don't persist this state.
const EMBED_MIN_DELTA = 50;
const EMBED_MIN_INTERVAL_MS = 30_000;
const lastEmbed: Map<string, { contentLen: number; at: number }> = new Map();

async function maybeRefreshNoteEmbedding(
  noteId: string,
  content: string
): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return; // Don't embed empty notes — they hold no signal.

  const last = lastEmbed.get(noteId);
  const now = Date.now();
  if (last) {
    const delta = Math.abs(trimmed.length - last.contentLen);
    if (delta < EMBED_MIN_DELTA && now - last.at < EMBED_MIN_INTERVAL_MS) {
      return;
    }
  }

  // Mark BEFORE awaiting so a flurry of saves while Gemini is in-flight
  // doesn't queue up duplicate calls.
  lastEmbed.set(noteId, { contentLen: trimmed.length, at: now });

  try {
    const vector = await embedText(trimmed, "document");
    if (!vector) return;
    const supabase = await createClient();
    await supabase
      .from("notes")
      .update({ embedding: toPgvector(vector) })
      .eq("id", noteId);
  } catch (err) {
    console.warn("[notes] embedding refresh failed:", err);
  }
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

/**
 * Validate a YYYY-MM-DD string. We accept what the client sends because
 * the client knows the user's local date; we just enforce shape.
 */
function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Fetch the note for a given day along with its todos. If no note exists yet,
 * we lazily create an empty one so callers always get a stable id back.
 *
 * Why lazy-create here (instead of waiting for the first edit):
 * - The carry-over UI needs a note_id to attach copied todos to.
 * - The autosave UPDATE needs a row to target.
 * - Empty rows are cheap and let the calendar strip distinguish "viewed but
 *   blank" from "never opened".
 */
export async function getOrCreateNote(day: string): Promise<{
  note: Note;
  todos: NoteTodo[];
}> {
  if (!isValidDay(day)) {
    throw new Error("Invalid day format — expected YYYY-MM-DD");
  }
  const supabase = await createClient();
  const userId = await getUserId();

  // Try to find it first. Common case after the first save.
  const { data: existing } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  let note: Note;
  if (existing) {
    note = existing as Note;
  } else {
    const { data: created, error } = await supabase
      .from("notes")
      .insert({ user_id: userId, day, content: "" })
      .select()
      .single();
    if (error || !created) {
      throw new Error(error?.message ?? "Failed to create note");
    }
    note = created as Note;
  }

  const { data: todos } = await supabase
    .from("note_todos")
    .select("*")
    .eq("note_id", note.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return { note, todos: (todos ?? []) as NoteTodo[] };
}

/**
 * Lightweight payload for the calendar strip — just which days have any
 * activity in the requested range, plus an open-todo count badge.
 */
export interface CalendarDay {
  day: string;
  hasContent: boolean;
  openTodos: number;
}

export async function getNoteCalendar(rangeDays = 14): Promise<CalendarDay[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const since = new Date();
  since.setDate(since.getDate() - (rangeDays - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: notes } = await supabase
    .from("notes")
    .select("id, day, content")
    .eq("user_id", userId)
    .gte("day", sinceStr);

  const noteByDay = new Map<string, { id: string; content: string }>();
  for (const n of notes ?? []) {
    noteByDay.set(n.day as string, { id: n.id as string, content: n.content as string });
  }

  let openCounts = new Map<string, number>();
  if (noteByDay.size > 0) {
    const noteIds = Array.from(noteByDay.values()).map((n) => n.id);
    const { data: openTodos } = await supabase
      .from("note_todos")
      .select("note_id")
      .in("note_id", noteIds)
      .eq("done", false);
    openCounts = (openTodos ?? []).reduce((m, t) => {
      const id = t.note_id as string;
      m.set(id, (m.get(id) ?? 0) + 1);
      return m;
    }, new Map<string, number>());
  }

  const result: CalendarDay[] = [];
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (rangeDays - 1 - i));
    const day = d.toISOString().slice(0, 10);
    const note = noteByDay.get(day);
    result.push({
      day,
      hasContent: !!note && note.content.trim().length > 0,
      openTodos: note ? (openCounts.get(note.id) ?? 0) : 0,
    });
  }
  return result;
}

/**
 * Find unfinished todos from the most recent day BEFORE `day` that has any.
 * Used to populate the "Carry over from yesterday" banner. We don't carry
 * automatically — the user clicks to apply.
 */
export async function getCarryoverCandidates(day: string): Promise<{
  sourceDay: string | null;
  todos: NoteTodo[];
}> {
  if (!isValidDay(day)) throw new Error("Invalid day");
  const supabase = await createClient();
  const userId = await getUserId();

  // Find the most recent prior note that has open todos. Walk back at most
  // 30 days to bound work; if the user has nothing in the last month, the
  // carry-over banner just doesn't appear.
  const { data: priorNotes } = await supabase
    .from("notes")
    .select("id, day")
    .eq("user_id", userId)
    .lt("day", day)
    .order("day", { ascending: false })
    .limit(30);

  for (const candidate of priorNotes ?? []) {
    const { data: open } = await supabase
      .from("note_todos")
      .select("*")
      .eq("note_id", candidate.id as string)
      .eq("done", false)
      .order("position", { ascending: true });
    if (open && open.length > 0) {
      return {
        sourceDay: candidate.day as string,
        todos: open as NoteTodo[],
      };
    }
  }

  return { sourceDay: null, todos: [] };
}

/**
 * Free-text search across notes content + todo labels. Uses Postgres
 * websearch_to_tsquery so users can write natural queries
 * (e.g. `"system design" -kafka`).
 */
export async function searchNotes(query: string, limit = 30): Promise<NotesSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const userId = await getUserId();

  // Run the two queries in parallel. We use ILIKE as a fallback when the
  // user types a single short word that wouldn't tokenize well, but for
  // most queries the FTS index is what matters.
  const tsQuery = trimmed;

  const [notesRes, todosRes] = await Promise.all([
    supabase
      .from("notes")
      .select("id, day, content")
      .eq("user_id", userId)
      .textSearch("content", tsQuery, { type: "websearch", config: "english" })
      .limit(limit),
    supabase
      .from("note_todos")
      .select("id, note_id, label, notes!inner(day)")
      // Both `note_todos` and the embedded `notes` row have `user_id`, so we
      // qualify the filter against the joined table to avoid ambiguity errors.
      .eq("notes.user_id", userId)
      .textSearch("label", tsQuery, { type: "websearch", config: "english" })
      .limit(limit),
  ]);

  if (notesRes.error) console.error("searchNotes (notes):", notesRes.error);
  if (todosRes.error) console.error("searchNotes (todos):", todosRes.error);

  const notes = notesRes.data;
  const todos = todosRes.data;

  const hits: NotesSearchHit[] = [];

  for (const n of notes ?? []) {
    hits.push({
      noteId: n.id as string,
      day: n.day as string,
      snippet: snippetAround(n.content as string, trimmed),
      matchedIn: "content",
    });
  }
  for (const t of todos ?? []) {
    const noteRel = (t as unknown as { notes: { day: string } }).notes;
    hits.push({
      noteId: t.note_id as string,
      day: noteRel.day,
      snippet: t.label as string,
      matchedIn: "todo",
    });
  }

  // Newest day first; within a day, content hits first.
  hits.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.matchedIn !== b.matchedIn) return a.matchedIn === "content" ? -1 : 1;
    return 0;
  });

  return hits.slice(0, limit);
}

function snippetAround(text: string, term: string, ctx = 60): string {
  if (!text) return "";
  const lc = text.toLowerCase();
  const idx = lc.indexOf(term.toLowerCase().split(/\s+/)[0] ?? "");
  if (idx < 0) return text.slice(0, ctx * 2);
  const start = Math.max(0, idx - ctx);
  const end = Math.min(text.length, idx + term.length + ctx);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function updateNoteContent(
  noteId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .update({ content })
    .eq("id", noteId);
  if (error) return { success: false, error: error.message };
  // We deliberately do NOT revalidate here — the client autosaves on every
  // keystroke and a revalidate per save would invalidate the whole route
  // tree on the server for no benefit.
  // Fire-and-forget embedding refresh — heavily throttled internally so
  // we don't burn Gemini quota on per-keystroke saves.
  void maybeRefreshNoteEmbedding(noteId, content);
  return { success: true };
}

export async function addTodo(
  noteId: string,
  label: string
): Promise<{ success: boolean; todo?: NoteTodo; error?: string }> {
  const trimmed = label.trim();
  if (!trimmed) return { success: false, error: "Empty todo label" };

  const supabase = await createClient();
  const userId = await getUserId();

  // Position = max(existing) + 1 so new items append.
  const { data: maxRow } = await supabase
    .from("note_todos")
    .select("position")
    .eq("note_id", noteId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position as number | undefined) ?? 0;

  const { data, error } = await supabase
    .from("note_todos")
    .insert({
      user_id: userId,
      note_id: noteId,
      label: trimmed,
      position: nextPos + 1,
    })
    .select()
    .single();
  if (error || !data) return { success: false, error: error?.message ?? "Failed to add todo" };
  return { success: true, todo: data as NoteTodo };
}

export async function toggleTodo(
  todoId: string,
  done: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("note_todos")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", todoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteTodo(
  todoId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("note_todos").delete().eq("id", todoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateTodoLabel(
  todoId: string,
  label: string
): Promise<{ success: boolean; error?: string }> {
  const trimmed = label.trim();
  if (!trimmed) return deleteTodo(todoId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("note_todos")
    .update({ label: trimmed })
    .eq("id", todoId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Persist a new ordering for a note's todos. The client passes the full list
 * of todo ids in their new order; we rewrite `position` 1..N to match.
 *
 * We intentionally write all positions (not a delta) so we don't have to
 * worry about gaps, ties, or drift across many reorder operations.
 */
export async function reorderTodos(input: {
  noteId: string;
  orderedIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  if (input.orderedIds.length === 0) return { success: true };

  const supabase = await createClient();
  const userId = await getUserId();

  // Update one row per call. With ~5–20 todos per day this is cheap and
  // avoids needing a server-side RPC. If we ever exceed ~50 we can swap
  // to a single `update from values` RPC.
  const updates = await Promise.all(
    input.orderedIds.map((id, idx) =>
      supabase
        .from("note_todos")
        .update({ position: idx + 1 })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("note_id", input.noteId)
    )
  );

  const failure = updates.find((u) => u.error);
  if (failure?.error) return { success: false, error: failure.error.message };
  return { success: true };
}

/**
 * Copy unchecked todos from a previous note onto the given target note.
 * Original todos are NOT modified — they remain on their source day so the
 * history stays accurate. The duplicated rows record their provenance via
 * `carried_from_note_id` so we can show "carried from Tue 5 May" later.
 */
export async function carryOverTodos(input: {
  targetNoteId: string;
  sourceTodoIds: string[];
}): Promise<{ success: boolean; carried?: NoteTodo[]; error?: string }> {
  if (input.sourceTodoIds.length === 0) {
    return { success: true, carried: [] };
  }

  const supabase = await createClient();
  const userId = await getUserId();

  const { data: sourceTodos } = await supabase
    .from("note_todos")
    .select("*")
    .in("id", input.sourceTodoIds)
    .eq("user_id", userId);

  if (!sourceTodos || sourceTodos.length === 0) {
    return { success: false, error: "Source todos not found" };
  }

  // Determine starting position to append after existing todos on the target.
  const { data: maxRow } = await supabase
    .from("note_todos")
    .select("position")
    .eq("note_id", input.targetNoteId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextPos = (maxRow?.position as number | undefined) ?? 0;

  const inserts = sourceTodos.map((src) => {
    nextPos += 1;
    return {
      user_id: userId,
      note_id: input.targetNoteId,
      label: src.label as string,
      position: nextPos,
      carried_from_note_id: src.note_id as string,
    };
  });

  const { data: created, error } = await supabase
    .from("note_todos")
    .insert(inserts)
    .select();
  if (error) return { success: false, error: error.message };
  return { success: true, carried: (created ?? []) as NoteTodo[] };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/**
 * Used by the page-level Server Component when revalidating after a route
 * change wouldn't otherwise refresh sidebars/calendars.
 */
export async function revalidateNotesRoutes() {
  revalidatePath("/notes");
  revalidatePath("/notes/[day]", "page");
}
