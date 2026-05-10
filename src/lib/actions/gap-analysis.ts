"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_USER_ID } from "@/lib/utils";
import { getModel, modelNameForTask } from "@/lib/ai/gemini";
import type {
  GapItem,
  GapReadout,
  GapSignalsSummary,
  KnowledgeGapAnalysis,
  RubricWeakness,
  StudyPlanItem,
} from "@/lib/types";

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? MOCK_USER_ID;
}

const RUBRIC_DIMENSIONS = [
  "technical_accuracy",
  "depth",
  "communication_clarity",
  "tradeoff_awareness",
  "staff_level_signal",
  "operational_excellence",
  "influence_communication",
] as const;

const ALL_CATEGORIES = [
  "dsa",
  "system_design",
  "backend",
  "frontend",
  "ai",
  "concepts",
  "languages",
] as const;

// ============================================================
// Aggregator — pulls every signal we have about the user.
// Kept deterministic and bounded so the AI prompt is reproducible.
// ============================================================

interface AggregatedSignals {
  summary: GapSignalsSummary;
  /** Compact, model-readable per-topic rollups. */
  topicStats: Array<{
    category: string;
    subcategory: string | null;
    entries: number;
    reviews: number;
    accuracy: number; // 0..1
    avg_rating: number; // 1..4 mean across reviews
    sample_size: number;
  }>;
  /** Recent answer evaluations — the richest qualitative signal. */
  recentEvaluations: Array<{
    category: string | null;
    subcategory: string | null;
    difficulty: string | null;
    overall_score: number;
    verdict: string;
    rubric_summary: Record<string, number>;
    gaps: string[];
    strengths: string[];
    missed_keywords: string[];
    created_at: string;
  }>;
  /** Mock interview final reports (conversational sessions only). */
  recentMockReports: Array<{
    mode: string;
    overall_score: number;
    verdict: string;
    drop_off_moments: string[];
    completed_at: string;
  }>;
}

// ============================================================
// Recurring-gap clustering (pgvector)
// ============================================================

/** Cosine similarity threshold above which two gaps are considered the same.
 *  Empirically with text-embedding-004:
 *   - paraphrases of the same weakness ("missed consistent hashing" /
 *     "no hash ring discussion") cluster around 0.80–0.92.
 *   - genuinely different weaknesses in the same category sit < 0.70.
 *  0.78 lets us collapse paraphrases without merging distinct concepts.
 */
const GAP_CLUSTER_THRESHOLD = 0.78;
/** Minimum cluster size to surface as a "recurring" gap. */
const GAP_CLUSTER_MIN_SIZE = 2;
/** Cap so a noisy user with 200 evaluations doesn't blow up the prompt. */
const GAP_CLUSTER_MAX_OUTPUT = 8;

interface GapClusterOutput {
  label: string;
  occurrences: number;
  cohesion: number;
}

/**
 * Greedy single-pass clustering of `answer_evaluations.gaps_embedding`.
 *
 * Algorithm:
 *   1. Pull (gaps_text, vector, created_at) for the user. Skip rows w/o vector.
 *   2. Sort newest-first so cluster "labels" prefer the most recent phrasing.
 *   3. For each gap row, compare its vector to every existing cluster's
 *      centroid; assign to the first cluster within threshold, otherwise
 *      start a new cluster.
 *   4. Update each cluster's centroid as the running mean of its members.
 *   5. Emit clusters of size >= MIN_SIZE, ordered by occurrences desc.
 *
 * Why greedy and not k-means: we don't know k; and clusters are tiny
 * (typically <30 members each) so the O(n*c) cost is fine.
 *
 * Why we read raw rows instead of going through match_eval_gaps_filtered:
 * the RPC returns top-k for ONE query vector. We need the full set so we
 * can compare every pair of gaps to each other. A single SELECT is cheaper
 * and simpler than k separate RPC calls.
 */
async function clusterRecurringGaps(userId: string): Promise<GapClusterOutput[]> {
  const supabase = await createClient();

  // Pull ALL evaluations that have an embedding. Cap at 500 — beyond that
  // a year of heavy use, we can paginate or sample.
  const { data: rows, error } = await supabase
    .from("answer_evaluations")
    .select("id, gaps, gaps_embedding, created_at")
    .eq("user_id", userId)
    .not("gaps_embedding", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !rows || rows.length === 0) return [];

  // pgvector returns vectors as either a JS array OR a string like
  // "[0.1,0.2,...]" depending on the supabase-js / postgrest version.
  // Normalise to number[] for the math below.
  type RawRow = {
    id: string;
    gaps: unknown;
    gaps_embedding: number[] | string | null;
    created_at: string;
  };
  const parseVector = (v: number[] | string | null): number[] | null => {
    if (!v) return null;
    if (Array.isArray(v)) return v;
    try {
      return JSON.parse(v) as number[];
    } catch {
      return null;
    }
  };

  // Each cluster keeps:
  //   centroid: running mean of member vectors
  //   members:  the gap-text labels (for the canonical-label pick later)
  //   size:     number of evaluations contributing
  //   cohesionSum: running sum of similarities-to-centroid-at-join (for avg)
  interface Cluster {
    centroid: number[];
    members: string[];
    size: number;
    cohesionSum: number;
  }
  const clusters: Cluster[] = [];

  for (const raw of rows as RawRow[]) {
    const vec = parseVector(raw.gaps_embedding);
    if (!vec) continue;
    const gapsArr = Array.isArray(raw.gaps) ? (raw.gaps as unknown[]).map(String) : [];
    if (gapsArr.length === 0) continue;
    const label = gapsArr.join(" | ");

    // Find the best matching existing cluster.
    let bestIdx = -1;
    let bestSim = -1;
    for (let c = 0; c < clusters.length; c++) {
      const sim = cosine(vec, clusters[c].centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = c;
      }
    }

    if (bestIdx >= 0 && bestSim >= GAP_CLUSTER_THRESHOLD) {
      // Join the existing cluster: update centroid (running mean) + bookkeeping.
      const cl = clusters[bestIdx];
      const newSize = cl.size + 1;
      for (let i = 0; i < cl.centroid.length; i++) {
        cl.centroid[i] = (cl.centroid[i] * cl.size + vec[i]) / newSize;
      }
      cl.size = newSize;
      cl.members.push(label);
      cl.cohesionSum += bestSim;
    } else {
      // Start a new cluster — centroid is just this vector.
      clusters.push({
        centroid: vec.slice(),
        members: [label],
        size: 1,
        cohesionSum: 1, // similarity-to-self is 1; keeps the cohesion math sane for size-1 clusters.
      });
    }
  }

  return clusters
    .filter((c) => c.size >= GAP_CLUSTER_MIN_SIZE)
    .sort((a, b) => b.size - a.size)
    .slice(0, GAP_CLUSTER_MAX_OUTPUT)
    .map((c) => ({
      // Pick the SHORTEST member as the canonical label — it's usually the
      // tightest summary and fits in UI/prompt without truncation.
      label: c.members.slice().sort((a, b) => a.length - b.length)[0],
      occurrences: c.size,
      cohesion: +(c.cohesionSum / c.size).toFixed(2),
    }));
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function aggregateSignals(userId: string): Promise<AggregatedSignals> {
  const supabase = await createClient();

  // Pull entries (small — under a few hundred rows in practice).
  const { data: entriesRaw } = await supabase
    .from("entries")
    .select("id, category, subcategory, tags, difficulty, created_at")
    .eq("user_id", userId);
  const entries = entriesRaw ?? [];

  // Pull cards with their entry's category so we can group reviews by topic
  // without a separate join per review.
  const { data: cardsRaw } = await supabase
    .from("cards")
    .select("id, entry_id, entries!inner(category, subcategory)")
    .eq("user_id", userId);

  // Type-guard the joined rows. Supabase's typed result for a 1:N+inner is a
  // bit loose, so we narrow here.
  type CardRow = {
    id: string;
    entry_id: string;
    entries: { category: string; subcategory: string | null } | { category: string; subcategory: string | null }[] | null;
  };
  const cards = (cardsRaw as unknown as CardRow[]) ?? [];
  const cardCategory = new Map<string, { category: string; subcategory: string | null }>();
  for (const c of cards) {
    const e = Array.isArray(c.entries) ? c.entries[0] : c.entries;
    if (e) cardCategory.set(c.id, { category: e.category, subcategory: e.subcategory });
  }

  // Recent reviews — we cap at the last 500 since the prompt is bounded.
  const { data: reviewsRaw } = await supabase
    .from("card_reviews")
    .select("card_id, rating, reviewed_at")
    .eq("user_id", userId)
    .order("reviewed_at", { ascending: false })
    .limit(500);
  const reviews = reviewsRaw ?? [];

  // Recent answer evaluations — qualitative signal, capped to the last 30
  // (more than enough for a synthesis prompt without blowing token budget).
  // NOTE: `missed_keywords` is not persisted on answer_evaluations today — we
  // synthesise the recurring-missed list from the qualitative `gaps` strings
  // in the prompt instead. If we ever add a missed_keywords column, the
  // aggregator will pick it up automatically below.
  const { data: evaluationsRaw } = await supabase
    .from("answer_evaluations")
    .select(
      "card_id, overall_score, verdict, rubric, gaps, strengths, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  const evaluations = evaluationsRaw ?? [];

  // Mock interview reports — only completed conversational ones carry a
  // rich final_report we can synthesise from.
  const { data: mocksRaw } = await supabase
    .from("mock_interviews")
    .select("mode, status, final_report, completed_at, conversation_mode")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(20);
  const mocks = mocksRaw ?? [];

  // ----- Compute per-category & per-topic rollups -----
  const categoryAccuracy: Record<string, { correct: number; total: number }> = {};
  const topicMap = new Map<
    string,
    { category: string; subcategory: string | null; reviews: number; correctSum: number; ratingSum: number }
  >();

  for (const r of reviews) {
    const meta = cardCategory.get(r.card_id);
    if (!meta) continue;
    const isCorrect = r.rating >= 3; // "Good" or "Easy" in FSRS rating scale
    categoryAccuracy[meta.category] ??= { correct: 0, total: 0 };
    categoryAccuracy[meta.category].correct += isCorrect ? 1 : 0;
    categoryAccuracy[meta.category].total += 1;

    const key = `${meta.category}::${meta.subcategory ?? "_"}`;
    const cur =
      topicMap.get(key) ?? {
        category: meta.category,
        subcategory: meta.subcategory,
        reviews: 0,
        correctSum: 0,
        ratingSum: 0,
      };
    cur.reviews += 1;
    cur.correctSum += isCorrect ? 1 : 0;
    cur.ratingSum += r.rating;
    topicMap.set(key, cur);
  }

  // Entry counts per topic — covers the "I wrote 5 entries on caching but
  // never reviewed any of them" case.
  const entryTopicCount = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.category}::${e.subcategory ?? "_"}`;
    entryTopicCount.set(key, (entryTopicCount.get(key) ?? 0) + 1);
  }
  for (const [key, count] of entryTopicCount) {
    if (!topicMap.has(key)) {
      const [category, sub] = key.split("::");
      topicMap.set(key, {
        category,
        subcategory: sub === "_" ? null : sub,
        reviews: 0,
        correctSum: 0,
        ratingSum: 0,
      });
    }
    // We don't need to mutate further — entries count is added below.
    void count;
  }

  const topicStats = Array.from(topicMap.entries()).map(([key, t]) => ({
    category: t.category,
    subcategory: t.subcategory,
    entries: entryTopicCount.get(key) ?? 0,
    reviews: t.reviews,
    accuracy: t.reviews > 0 ? +(t.correctSum / t.reviews).toFixed(2) : 0,
    avg_rating: t.reviews > 0 ? +(t.ratingSum / t.reviews).toFixed(2) : 0,
    sample_size: t.reviews,
  }));

  // ----- Rubric averages across answer evaluations -----
  const rubricAverages: Record<string, number> = {};
  const rubricSums: Record<string, { sum: number; n: number }> = {};
  for (const ev of evaluations) {
    const rubric = (ev.rubric ?? {}) as Record<string, { score?: number }>;
    for (const dim of RUBRIC_DIMENSIONS) {
      const score = rubric[dim]?.score;
      if (typeof score !== "number") continue;
      rubricSums[dim] ??= { sum: 0, n: 0 };
      rubricSums[dim].sum += score;
      rubricSums[dim].n += 1;
    }
  }
  for (const dim of RUBRIC_DIMENSIONS) {
    const s = rubricSums[dim];
    if (s && s.n > 0) rubricAverages[dim] = +(s.sum / s.n).toFixed(2);
  }

  // ----- Recurring missed keywords -----
  const keywordFreq = new Map<string, number>();
  for (const ev of evaluations) {
    const list = Array.isArray((ev as unknown as { missed_keywords?: string[] }).missed_keywords)
      ? (ev as unknown as { missed_keywords: string[] }).missed_keywords
      : [];
    for (const k of list) {
      const norm = (k ?? "").toString().trim().toLowerCase();
      if (!norm) continue;
      keywordFreq.set(norm, (keywordFreq.get(norm) ?? 0) + 1);
    }
  }
  const recurringMissed = Array.from(keywordFreq.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);

  // ----- Recurring gap CLUSTERS via pgvector -----
  // String-equality `recurringMissed` above misses paraphrases. Cluster the
  // qualitative `gaps[]` text by cosine similarity to surface "you keep
  // missing X" patterns even when the user phrases X differently each time.
  const recurringGapClusters = await clusterRecurringGaps(userId);

  // ----- Coverage gaps: categories with zero entries -----
  const presentCategories = new Set(entries.map((e) => e.category));
  const uncovered = ALL_CATEGORIES.filter((c) => !presentCategories.has(c));

  // ----- Per-category accuracy as 0..1 + sample size -----
  const catAccuracy: Record<string, number> = {};
  const catSample: Record<string, number> = {};
  for (const [cat, v] of Object.entries(categoryAccuracy)) {
    catAccuracy[cat] = v.total > 0 ? +(v.correct / v.total).toFixed(2) : 0;
    catSample[cat] = v.total;
  }

  const summary: GapSignalsSummary = {
    entries_total: entries.length,
    cards_total: cards.length,
    reviews_total: reviews.length,
    evaluations_total: evaluations.length,
    mock_interviews_total: mocks.length,
    conversational_mocks_total: mocks.filter((m) => m.conversation_mode).length,
    uncovered_categories: uncovered,
    category_accuracy: catAccuracy,
    category_sample: catSample,
    rubric_averages: rubricAverages,
    recurring_missed_keywords: recurringMissed,
    recurring_gap_clusters: recurringGapClusters,
  };

  const recentEvaluations = evaluations.slice(0, 15).map((ev) => {
    const rubric = (ev.rubric ?? {}) as Record<string, { score?: number }>;
    const rubric_summary: Record<string, number> = {};
    for (const dim of RUBRIC_DIMENSIONS) {
      const s = rubric[dim]?.score;
      if (typeof s === "number") rubric_summary[dim] = s;
    }
    const meta = cardCategory.get(ev.card_id) ?? { category: null, subcategory: null };
    return {
      category: meta.category ?? null,
      subcategory: meta.subcategory ?? null,
      difficulty: null,
      overall_score: ev.overall_score,
      verdict: ev.verdict,
      rubric_summary,
      gaps: Array.isArray(ev.gaps) ? (ev.gaps as string[]).slice(0, 5) : [],
      strengths: Array.isArray(ev.strengths) ? (ev.strengths as string[]).slice(0, 3) : [],
      missed_keywords: Array.isArray((ev as unknown as { missed_keywords?: string[] }).missed_keywords)
        ? (ev as unknown as { missed_keywords: string[] }).missed_keywords.slice(0, 5)
        : [],
      created_at: ev.created_at,
    };
  });

  const recentMockReports = mocks
    .filter((m) => m.final_report)
    .slice(0, 6)
    .map((m) => {
      const fr = m.final_report as {
        overall_score?: number;
        verdict?: string;
        drop_off_moments?: string[];
      } | null;
      return {
        mode: m.mode,
        overall_score: fr?.overall_score ?? 0,
        verdict: fr?.verdict ?? "unknown",
        drop_off_moments: Array.isArray(fr?.drop_off_moments)
          ? fr!.drop_off_moments!.slice(0, 4)
          : [],
        completed_at: m.completed_at ?? "",
      };
    });

  return { summary, topicStats, recentEvaluations, recentMockReports };
}

// ============================================================
// Public actions
// ============================================================

export async function getLatestGapAnalysis(): Promise<KnowledgeGapAnalysis | null> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("knowledge_gap_analyses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as KnowledgeGapAnalysis;
}

export async function getGapAnalysisHistory(limit = 10): Promise<KnowledgeGapAnalysis[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("knowledge_gap_analyses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as KnowledgeGapAnalysis[];
}

/**
 * Aggregates the user's data, asks Gemini to synthesise gaps + a study plan,
 * persists the result, and returns it. The caller (the Gaps page) revalidates
 * after success so the new snapshot renders.
 */
export async function analyzeKnowledgeGaps(): Promise<
  | { success: true; analysis: KnowledgeGapAnalysis }
  | { success: false; error: string }
> {
  const userId = await getUserId();
  const signals = await aggregateSignals(userId);

  // If the user has nothing yet, don't waste an AI call — render a friendly
  // empty-state instead. The threshold is intentionally low (one entry) so
  // brand-new users still get directional guidance.
  if (
    signals.summary.entries_total === 0 &&
    signals.summary.reviews_total === 0 &&
    signals.summary.evaluations_total === 0
  ) {
    return {
      success: false,
      error:
        "Not enough data yet. Add a few learning entries and review some cards, then try again.",
    };
  }

  const task = "gap_analysis" as const;
  let model;
  try {
    model = getModel(task, { json: true, temperature: 0.4 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI not configured";
    return { success: false, error: message };
  }

  const prompt = buildGapPrompt(signals);

  let parsed: AiGapResponse | null = null;
  try {
    const result = await model.generateContent(prompt);
    parsed = parseGapResponse(result.response.text());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }

  if (!parsed) {
    return { success: false, error: "Failed to parse AI response" };
  }

  // Persist + return.
  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("knowledge_gap_analyses")
    .insert({
      user_id: userId,
      window_start: null,
      window_end: new Date().toISOString(),
      signals_summary: signals.summary,
      readout: parsed.readout,
      gaps: parsed.gaps,
      strengths: parsed.strengths,
      study_plan: parsed.study_plan,
      rubric_weakness: parsed.rubric_weakness,
      model_used: modelNameForTask(task),
    })
    .select()
    .single();

  if (insertError || !inserted) {
    return { success: false, error: insertError?.message ?? "Failed to persist analysis" };
  }

  revalidatePath("/gaps");
  revalidatePath("/");
  return { success: true, analysis: inserted as KnowledgeGapAnalysis };
}

// ============================================================
// Prompt + parsing
// ============================================================

interface AiGapResponse {
  readout: GapReadout;
  gaps: GapItem[];
  strengths: string[];
  study_plan: StudyPlanItem[];
  rubric_weakness: RubricWeakness[];
}

function buildGapPrompt(signals: AggregatedSignals): string {
  // We feed the model compact structured stats + a small sample of recent
  // qualitative evidence. The prompt explicitly anchors every claim to
  // observable numbers so the output stays grounded.
  return `You are a senior engineering coach analysing a learner's interview-prep practice data. Your job is to identify their KNOWLEDGE GAPS — not generic advice, but concrete weaknesses backed by the numbers below — and produce a 7-day study plan.

DATA SNAPSHOT:
${JSON.stringify(
  {
    summary: signals.summary,
    topic_breakdown: signals.topicStats,
    recent_answer_evaluations: signals.recentEvaluations,
    recent_mock_interview_reports: signals.recentMockReports,
  },
  null,
  2
)}

INTERPRETATION GUIDE:
- card_reviews ratings: 1 = "Again" (forgot), 2 = "Hard", 3 = "Good", 4 = "Easy". Treat <3 as a miss.
- A topic with high entries but low reviews = "wrote it down, never came back" → recall risk.
- A topic with low accuracy AND high sample size = real weakness.
- A topic with low accuracy AND tiny sample size = needs more data; mark confidence accordingly.
- rubric_averages below 3.0 indicate a cross-cutting weakness across the user's ENTIRE answer style.
- recurring_missed_keywords reveal blind spots the user keeps missing across categories.
- recurring_gap_clusters are SEMANTICALLY-grouped recurring weaknesses (paraphrases collapsed via embedding similarity). A cluster of size ≥ 3 is the strongest possible signal of a real, persistent gap — call these out by name in the gaps array and weight them above any single-row evaluation.
- uncovered_categories with zero entries = coverage gap, not a knowledge gap. Surface separately.
- Mock interview drop_off_moments often expose the same pattern repeatedly — call it out.

Produce a CALIBRATED, EVIDENCE-BACKED response. Every gap MUST cite at least one number from the snapshot in its evidence array (e.g. "accuracy 42% over 14 reviews", "tradeoff_awareness averages 1.8/5 across 9 evaluations").

Severity rubric:
- "critical": will tank an interview today; rubric dim ≤2 OR category accuracy ≤40% with sample ≥10.
- "high": clear weakness; rubric dim ≤2.5 OR category accuracy ≤55% with sample ≥10.
- "medium": room to improve; sample is meaningful but not critical.
- "low": minor or low-confidence (small sample); include if instructive but not the headline.

Confidence rubric (0..1): scale roughly with sample size — <5 reviews → 0.3, 5-15 → 0.6, 15+ → 0.85+.

Study plan rules:
- Exactly 7 items, day 1..7. Vary the activity (write entry, do flashcards, attempt mock, deep-dive on a concept).
- Start with the most critical gap on day 1 and 2. Rotate so the user isn't grinding the same thing daily.
- est_minutes between 15 and 60. Keep it realistic for a working professional.
- Where possible, suggest the SHAPE of the action ("attempt 3 medium DSA cards on Trees & Graphs", not "study trees").

Strengths: 2-4 bullets, also evidence-backed. Don't fabricate.

Readout level mapping:
- 0-39: "foundational"
- 40-59: "developing"
- 60-79: "proficient"
- 80-100: "advanced"

Respond with ONLY this JSON shape (no markdown, no prose):
{
  "readout": {
    "overall_readiness": <0-100 integer>,
    "level": "<foundational|developing|proficient|advanced>",
    "headline": "<one short sentence summarising where they stand>",
    "one_liner": "<one sentence on the single most important thing to fix next>"
  },
  "gaps": [
    {
      "topic": "<short topic name>",
      "category": "<dsa|system_design|backend|frontend|ai|concepts|languages>",
      "severity": "<critical|high|medium|low>",
      "evidence": ["<data-grounded statement>", "..."],
      "suggested_actions": ["<concrete action>", "..."],
      "confidence": <0..1>
    }
  ],
  "strengths": ["<evidence-backed strength>", "..."],
  "study_plan": [
    {
      "day": <1..7>,
      "focus": "<topic / theme>",
      "action": "<concrete thing to do that day>",
      "est_minutes": <15..60 integer>
    }
  ],
  "rubric_weakness": [
    {
      "dimension": "<one of the 7 staff rubric dimensions>",
      "avg_score": <0..5>,
      "sample_size": <integer>,
      "insight": "<what this pattern means for interview performance>"
    }
  ]
}

Hard limits: gaps array 3-7 items, strengths 2-4 items, study_plan EXACTLY 7 items, rubric_weakness 0-3 items. If there is no qualitative data (zero evaluations), return an empty rubric_weakness array — do not invent dimensions.`;
}

function parseGapResponse(text: string): AiGapResponse | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    const parsed = JSON.parse(cleaned) as Partial<AiGapResponse>;

    if (!parsed.readout || !Array.isArray(parsed.gaps) || !Array.isArray(parsed.study_plan)) {
      return null;
    }

    // Sanitise + clamp numeric fields so a wobbly model response doesn't
    // produce a NaN-laden DB row.
    const readout: GapReadout = {
      overall_readiness: clamp(Math.round(parsed.readout.overall_readiness ?? 0), 0, 100),
      level: (parsed.readout.level ?? "developing") as GapReadout["level"],
      headline: parsed.readout.headline ?? "",
      one_liner: parsed.readout.one_liner ?? "",
    };

    const gaps: GapItem[] = parsed.gaps.slice(0, 8).map((g) => ({
      topic: String(g.topic ?? ""),
      category: String(g.category ?? "concepts"),
      severity: (["critical", "high", "medium", "low"].includes(String(g.severity))
        ? g.severity
        : "medium") as GapItem["severity"],
      evidence: Array.isArray(g.evidence) ? g.evidence.map(String).slice(0, 5) : [],
      suggested_actions: Array.isArray(g.suggested_actions)
        ? g.suggested_actions.map(String).slice(0, 4)
        : [],
      confidence: clamp(Number(g.confidence ?? 0.5), 0, 1),
    }));

    const study_plan: StudyPlanItem[] = parsed.study_plan.slice(0, 7).map((s, i) => ({
      day: clamp(Math.round(s.day ?? i + 1), 1, 7),
      focus: String(s.focus ?? ""),
      action: String(s.action ?? ""),
      est_minutes: clamp(Math.round(s.est_minutes ?? 30), 5, 180),
    }));

    const rubric_weakness: RubricWeakness[] = Array.isArray(parsed.rubric_weakness)
      ? parsed.rubric_weakness.slice(0, 4).map((r) => ({
          dimension: String(r.dimension ?? ""),
          avg_score: clamp(Number(r.avg_score ?? 0), 0, 5),
          sample_size: Math.max(0, Math.round(Number(r.sample_size ?? 0))),
          insight: String(r.insight ?? ""),
        }))
      : [];

    return {
      readout,
      gaps,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 5) : [],
      study_plan,
      rubric_weakness,
    };
  } catch {
    return null;
  }
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
