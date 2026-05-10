import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedTexts, toPgvector } from "@/lib/ai/embeddings";

/**
 * One-shot embedding backfill.
 *
 * Iterates the four embedding-bearing tables, finds rows whose vector
 * column is NULL, embeds them in batches, and writes the vectors back.
 * Designed to be hit once after enabling pgvector + applying the
 * embedding columns migration. Idempotent — re-running it is safe and
 * cheap (it only touches NULL rows).
 *
 * Curl:
 *   curl -X POST 'http://localhost:3000/api/admin/backfill-embeddings'
 *   curl -X POST 'http://localhost:3000/api/admin/backfill-embeddings?table=entries'
 *
 * Concurrency / rate limits:
 *   - text-embedding-004 free tier is ~1500 RPM. We batch via
 *     batchEmbedContents which counts each item against the budget but
 *     bundles them into one HTTP round-trip.
 *   - BATCH_SIZE=25 + a 1.5s pause between batches keeps us comfortably
 *     under the limit even on a large user.
 *
 * NOTE: this route has no auth gate — it relies on the app being
 * single-user (MOCK_USER_ID) and only running locally. If/when we add
 * real auth, gate this behind an admin check or delete it after use.
 */

const BATCH_SIZE = 25;
const PAUSE_MS = 1500;

type TableName = "entries" | "cards" | "notes" | "answer_evaluations";

interface TableSpec {
  name: TableName;
  vectorColumn: string;
  /** Columns we need to fetch to construct the embed-able text. */
  textColumns: string[];
  /** Build the embedding source text from a row. */
  buildText: (row: Record<string, unknown>) => string;
}

const SPECS: TableSpec[] = [
  {
    name: "entries",
    vectorColumn: "embedding",
    textColumns: ["id", "title", "content"],
    buildText: (r) => `${r.title ?? ""}\n\n${r.content ?? ""}`,
  },
  {
    name: "cards",
    vectorColumn: "question_embedding",
    textColumns: ["id", "question"],
    buildText: (r) => String(r.question ?? ""),
  },
  {
    name: "notes",
    vectorColumn: "embedding",
    textColumns: ["id", "content"],
    buildText: (r) => String(r.content ?? ""),
  },
  {
    name: "answer_evaluations",
    vectorColumn: "gaps_embedding",
    textColumns: ["id", "gaps"],
    buildText: (r) => {
      const gaps = Array.isArray(r.gaps) ? (r.gaps as unknown[]) : [];
      return gaps.map(String).join(" | ");
    },
  },
];

interface TableResult {
  table: TableName;
  scanned: number;
  embedded: number;
  failed: number;
  skipped_empty: number;
}

async function backfillTable(spec: TableSpec): Promise<TableResult> {
  const supabase = await createClient();
  const result: TableResult = {
    table: spec.name,
    scanned: 0,
    embedded: 0,
    failed: 0,
    skipped_empty: 0,
  };

  // Page through NULL-embedding rows. We always re-query for the next batch
  // so we don't have to track an offset — just keep grabbing rows that are
  // still missing a vector.
  while (true) {
    const { data: rows, error } = await supabase
      .from(spec.name)
      .select(spec.textColumns.join(","))
      .is(spec.vectorColumn, null)
      .limit(BATCH_SIZE);

    if (error) {
      console.warn(`[backfill] ${spec.name} select failed:`, error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    result.scanned += rows.length;

    // Build texts; rows with no usable text get nulled out so we don't burn
    // an embedding call on them, but they also won't be retried — note them
    // separately in the response for visibility.
    const texts = (rows as unknown as Record<string, unknown>[]).map((r) =>
      spec.buildText(r).trim()
    );
    const embedInputs = texts.map((t) => (t ? t : ""));
    const embeddings = await embedTexts(embedInputs, "document");

    // Update one-by-one. Bulk update of distinct vector values per row is
    // awkward in PostgREST without a custom RPC; the per-row latency is
    // fine at backfill volumes (one-time, single-user).
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as unknown as { id: string };
      const vector = embeddings[i];
      if (!texts[i]) {
        result.skipped_empty += 1;
        // Write a zero vector? No — leave NULL so the next call keeps
        // skipping it. To AVOID an infinite loop on permanently-empty rows,
        // we exit the while loop below if a whole batch produced zero
        // updates.
        continue;
      }
      if (!vector) {
        result.failed += 1;
        continue;
      }
      const { error: updateErr } = await supabase
        .from(spec.name)
        .update({ [spec.vectorColumn]: toPgvector(vector) })
        .eq("id", row.id);
      if (updateErr) {
        console.warn(
          `[backfill] ${spec.name}.${row.id} update failed:`,
          updateErr.message
        );
        result.failed += 1;
      } else {
        result.embedded += 1;
      }
    }

    // If this batch was nothing but skipped_empty rows, the same rows will
    // come back next iteration — break out instead of looping forever.
    const productive = rows.filter((_, i) => texts[i]).length;
    if (productive === 0) break;

    if (rows.length < BATCH_SIZE) break;
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }

  return result;
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table") as TableName | null;

  const targets = table ? SPECS.filter((s) => s.name === table) : SPECS;
  if (targets.length === 0) {
    return NextResponse.json(
      { error: `Unknown table: ${table}` },
      { status: 400 }
    );
  }

  const results: TableResult[] = [];
  for (const spec of targets) {
    results.push(await backfillTable(spec));
  }

  return NextResponse.json({ ok: true, results });
}
