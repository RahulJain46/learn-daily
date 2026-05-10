import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

/**
 * Embeddings helper. Mirrors the structure of `gemini.ts` so call sites have
 * one obvious place to look for AI access.
 *
 * Model: `gemini-embedding-001` — Google's current general-purpose embedding
 * model on the Gemini API (the older `text-embedding-004` was deprecated and
 * now returns 404 on v1beta). Free-tier eligible, same GEMINI_API_KEY as
 * Gemini chat.
 *
 * Why a single fixed model (no MODEL_FOR_TASK map like Gemini):
 *   - We only have one embedding workload right now.
 *   - Switching models would require re-embedding every row in the DB; it's
 *     not a per-call decision.
 *
 * Why 768 dimensions (when the model defaults to 3072):
 *   - Our pgvector columns and HNSW indexes are `vector(768)`. Bumping to
 *     3072 would mean dropping/recreating columns + indexes and re-running
 *     the backfill — for marginal quality gain at our scale.
 *   - `gemini-embedding-001` uses Matryoshka Representation Learning: the
 *     768-dim output is an explicitly-supported high-quality truncation of
 *     the full 3072-dim vector. Google recommends 3072 / 1536 / 768 as the
 *     three "sweet spot" dimensions.
 *   - We pass this via `outputDimensionality: 768` on every request. The
 *     SDK's typed `EmbedContentRequest` doesn't expose this field yet (as
 *     of @google/generative-ai v0.24.1) but the REST API accepts it — see
 *     `withDim()` below for the cast.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Cap input text before sending. `gemini-embedding-001` has a generous input
 * window, but blurry "average of 5 paragraphs" embeddings hurt search
 * quality more than truncation does. 2000 chars ≈ 500 tokens — captures the
 * meaning of a single entry/note/card cleanly.
 */
const MAX_INPUT_CHARS = 2000;

/**
 * Distinguishes the two contexts an embedding can be created in.
 *
 *   - "document": embed something we're STORING (a card, note, entry…).
 *     Use TaskType.RETRIEVAL_DOCUMENT so Google tunes the vector for the
 *     "haystack" side of retrieval.
 *   - "query":    embed a SEARCH STRING the user just typed.
 *     Use TaskType.RETRIEVAL_QUERY so the vector lives in the same space
 *     as the documents but is biased toward the "needle" side.
 *
 * Mixing these yields measurably worse top-k. Always pass the right one.
 */
export type EmbedKind = "document" | "query";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * Adds `outputDimensionality` to a request without fighting the SDK's narrow
 * type for `EmbedContentRequest`. The REST endpoint honours it; the TS type
 * just doesn't list it yet (v0.24.1).
 */
function withDim<T>(req: T): T {
  return { ...req, outputDimensionality: EMBEDDING_DIMENSIONS } as T;
}

function clean(text: string): string {
  // Strip excess whitespace and cap length. The embedding model treats
  // formatting noise as content, so an entry full of `\n\n\n` blocks gets
  // blurry vectors otherwise.
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_INPUT_CHARS);
}

/**
 * Embed a single piece of text. Returns null on any failure (quota, network,
 * truncated response) so callers can degrade gracefully — a missing
 * embedding is far less bad than a thrown exception that breaks an
 * unrelated user write.
 */
export async function embedText(
  text: string,
  kind: EmbedKind = "document"
): Promise<number[] | null> {
  const cleaned = clean(text);
  if (!cleaned) return null;

  try {
    const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(
      withDim({
        content: { role: "user", parts: [{ text: cleaned }] },
        taskType:
          kind === "query" ? TaskType.RETRIEVAL_QUERY : TaskType.RETRIEVAL_DOCUMENT,
      })
    );
    const values = result.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      return null;
    }
    return values;
  } catch (err) {
    // We deliberately swallow here — the calling write path should not fail
    // because Gemini hiccupped. Logging keeps the issue diagnosable in dev.
    console.warn(
      "[embedText] failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Batch variant for the backfill script. Uses Gemini's
 * batchEmbedContents endpoint which is one network round-trip but still
 * counts each item against the per-minute request budget — keep batch size
 * modest (≤ 50) and rate-limit between batches if you have many rows.
 */
export async function embedTexts(
  texts: string[],
  kind: EmbedKind = "document"
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];

  const cleaned = texts.map(clean);
  // Empty inputs would be rejected by the API; substitute a placeholder and
  // null them out in the response so caller indices stay aligned.
  const requests = cleaned.map((text) =>
    withDim({
      content: { role: "user", parts: [{ text: text || " " }] },
      taskType:
        kind === "query" ? TaskType.RETRIEVAL_QUERY : TaskType.RETRIEVAL_DOCUMENT,
    })
  );

  try {
    const model = getClient().getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.batchEmbedContents({ requests });
    return result.embeddings.map((e, i) => {
      if (!cleaned[i]) return null;
      const v = e.values;
      if (!Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS) return null;
      return v;
    });
  } catch (err) {
    console.warn(
      "[embedTexts] failed:",
      err instanceof Error ? err.message : err
    );
    return texts.map(() => null);
  }
}

/**
 * pgvector accepts vectors as the literal string `'[0.1,0.2,...]'` over
 * PostgREST. supabase-js doesn't know about the `vector` type so this is the
 * idiomatic shape for inserts/updates.
 */
export function toPgvector(values: number[]): string {
  return `[${values.join(",")}]`;
}
