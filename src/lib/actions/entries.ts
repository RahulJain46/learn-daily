"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { embedText, toPgvector } from "@/lib/ai/embeddings";
import {
  CATEGORY_CONFIG,
  type Category,
  type Difficulty,
  type EntrySearchHit,
} from "@/lib/types";

/**
 * Re-embed an entry's title + content and persist the vector. Best-effort —
 * failures are logged but never thrown. Called after create/update so the
 * vector index stays in lockstep with the canonical text.
 *
 * We embed `title\n\n\ncontent` because the title carries disproportionate
 * topical signal in this app (it's how users navigate their own notes).
 */
async function refreshEntryEmbedding(
  entryId: string,
  title: string,
  content: string
): Promise<void> {
  try {
    const vector = await embedText(`${title}\n\n${content}`, "document");
    if (!vector) return;
    const supabase = await createClient();
    await supabase
      .from("entries")
      .update({ embedding: toPgvector(vector) })
      .eq("id", entryId);
  } catch (err) {
    console.warn("[entries] embedding refresh failed:", err);
  }
}

async function getUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

export async function getEntries(category?: string) {
  const supabase = await createClient();
  const userId = await getUserId();

  let query = supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Global search across the user's entries. Matches against:
 *   - title       (ILIKE)
 *   - content     (ILIKE)
 *   - subcategory (ILIKE)
 *   - category    (raw key + human label, e.g. "system design" → "system_design")
 *   - tags        (array contains, exact token; partial matches fall through to title/content)
 *
 * We deliberately use ILIKE rather than full-text search because (a) the user
 * often types partial words ("kafk"), which `to_tsquery` would not match, and
 * (b) the corpus is small (one user's notes). If this ever gets slow, add a
 * pg_trgm GIN index on (title, content) and ILIKE will use it transparently.
 */
export async function searchEntries(
  query: string,
  limit = 20
): Promise<EntrySearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const userId = await getUserId();

  // Escape PostgREST `or` filter separators and SQL LIKE wildcards so a user
  // who types `100%` or `a,b` doesn't blow up the query.
  const safeLike = trimmed.replace(/[\\%_]/g, (m) => `\\${m}`);
  const likePattern = `%${safeLike}%`;

  // Map a typed label like "system design" to its category key so a category
  // search works even though the column stores the snake_case key.
  const lcQuery = trimmed.toLowerCase();
  const matchedCategoryKeys = (
    Object.entries(CATEGORY_CONFIG) as [Category, { label: string }][]
  )
    .filter(
      ([key, cfg]) =>
        key.toLowerCase().includes(lcQuery) ||
        cfg.label.toLowerCase().includes(lcQuery)
    )
    .map(([key]) => key);

  // PostgREST `.or()` takes a comma-separated list of filters. `cs` = "contains"
  // for array columns; tags must be an exact token to match here.
  const orClauses: string[] = [
    `title.ilike.${likePattern}`,
    `content.ilike.${likePattern}`,
    `subcategory.ilike.${likePattern}`,
    `tags.cs.{${trimmed.replace(/["\\]/g, "")}}`,
  ];
  if (matchedCategoryKeys.length > 0) {
    orClauses.push(`category.in.(${matchedCategoryKeys.join(",")})`);
  }

  const { data, error } = await supabase
    .from("entries")
    .select("id, title, content, category, subcategory, tags, created_at")
    .eq("user_id", userId)
    .or(orClauses.join(","))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("searchEntries failed:", error);
    return [];
  }

  return (data ?? []).map((row) => buildEntryHit(row, trimmed));
}

function buildEntryHit(
  row: {
    id: string;
    title: string;
    content: string;
    category: string;
    subcategory: string | null;
    tags: string[];
  },
  query: string
): EntrySearchHit {
  const lc = query.toLowerCase();
  const inTitle = row.title.toLowerCase().includes(lc);
  const inContent = row.content.toLowerCase().includes(lc);
  const inSub = (row.subcategory ?? "").toLowerCase().includes(lc);
  const inTag = row.tags.some((t) => t.toLowerCase().includes(lc));
  const catCfg = CATEGORY_CONFIG[row.category as Category];
  const inCategory =
    row.category.toLowerCase().includes(lc) ||
    (catCfg?.label.toLowerCase().includes(lc) ?? false);

  let matchedIn: EntrySearchHit["matchedIn"] = "title";
  let snippet = row.title;
  if (inTitle) {
    matchedIn = "title";
    snippet = row.title;
  } else if (inContent) {
    matchedIn = "content";
    snippet = snippetAround(row.content, query);
  } else if (inTag) {
    matchedIn = "tag";
    snippet = row.tags.find((t) => t.toLowerCase().includes(lc)) ?? row.title;
  } else if (inSub) {
    matchedIn = "subcategory";
    snippet = row.subcategory ?? row.title;
  } else if (inCategory) {
    matchedIn = "category";
    snippet = catCfg?.label ?? row.category;
  }

  return {
    id: row.id,
    title: row.title,
    category: row.category as Category,
    subcategory: row.subcategory,
    tags: row.tags,
    snippet,
    matchedIn,
  };
}

function snippetAround(text: string, term: string, ctx = 60): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, ctx * 2);
  const start = Math.max(0, idx - ctx);
  const end = Math.min(text.length, idx + term.length + ctx);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export async function getEntry(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

export async function createEntry(formData: {
  title: string;
  content: string;
  category: Category;
  subcategory?: string;
  tags: string[];
  difficulty: Difficulty;
}) {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("entries")
    .insert({
      user_id: userId,
      title: formData.title,
      content: formData.content,
      category: formData.category,
      subcategory: formData.subcategory || null,
      tags: formData.tags,
      difficulty: formData.difficulty,
    })
    .select()
    .single();

  if (error) throw error;

  // Fire-and-forget embedding refresh. We deliberately do NOT await so the
  // user sees the new entry immediately even if Gemini is slow/throttled.
  // A missing embedding will be picked up by the backfill route.
  void refreshEntryEmbedding(data.id, formData.title, formData.content);

  revalidatePath("/entries");
  revalidatePath("/");
  return data;
}

export async function updateEntry(
  id: string,
  formData: {
    title: string;
    content: string;
    category: Category;
    subcategory?: string;
    tags: string[];
    difficulty: Difficulty;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("entries")
    .update({
      title: formData.title,
      content: formData.content,
      category: formData.category,
      subcategory: formData.subcategory || null,
      tags: formData.tags,
      difficulty: formData.difficulty,
    })
    .eq("id", id);

  if (error) throw error;

  void refreshEntryEmbedding(id, formData.title, formData.content);

  revalidatePath(`/entries/${id}`);
  revalidatePath("/entries");
  revalidatePath("/");
}

export async function deleteEntry(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("entries").delete().eq("id", id);

  if (error) throw error;

  revalidatePath("/entries");
  revalidatePath("/");
  redirect("/entries");
}
