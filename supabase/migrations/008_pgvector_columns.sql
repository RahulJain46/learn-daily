-- ============================================
-- Phase 6: pgvector — embedding columns + ANN indexes
--
-- Prereq: the `vector` extension must already be enabled (Supabase
--   Dashboard → Database → Extensions → toggle `vector` ON).
--
-- We embed four kinds of text with Google `text-embedding-004` (768 dims,
-- free tier, same GEMINI_API_KEY the rest of the app already uses):
--
--   1. entries.embedding             — title + content of a study entry.
--   2. cards.question_embedding      — the question text of a revision card.
--   3. notes.embedding               — daily journal content.
--   4. answer_evaluations.gaps_embedding — concatenated `gaps[]` strings.
--
-- Why HNSW + cosine:
--   - Read-heavy, low write volume (handful of inserts/user/day) — HNSW gives
--     better recall than ivfflat at this scale and the build is fast enough.
--   - Cosine matches how `text-embedding-004` vectors are compared in the
--     Google docs and in our match_* RPCs (operator `<=>`).
--
-- Why columns are NULLABLE:
--   - Lets us ship the column today and backfill embeddings asynchronously
--     (see /api/admin/backfill-embeddings) without a migration that has to
--     call out to Gemini.
--   - Embed-on-write paths swallow errors so a transient Gemini 429 never
--     blocks the user's underlying write.
-- Run this in Supabase SQL Editor.
-- ============================================

-- 1. Add the columns. `if not exists` because re-running a migration in dev
--    is common, and `add column` doesn't have an idempotent variant <PG 16.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entries' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE entries ADD COLUMN embedding extensions.vector(768);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cards' AND column_name = 'question_embedding'
  ) THEN
    ALTER TABLE cards ADD COLUMN question_embedding extensions.vector(768);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE notes ADD COLUMN embedding extensions.vector(768);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'answer_evaluations' AND column_name = 'gaps_embedding'
  ) THEN
    ALTER TABLE answer_evaluations ADD COLUMN gaps_embedding extensions.vector(768);
  END IF;
END$$;

-- 2. HNSW indexes. m=16, ef_construction=64 are pgvector's defaults — we
--    can tune later if recall is unsatisfactory at scale, but at <10k
--    vectors per user the defaults are well past "good enough".
--
-- Note: filtering by user_id happens INSIDE the match_* SQL functions (see
-- 009_match_functions.sql). The planner combines the user_id btree below
-- with the HNSW scan; we don't use a partial index on user_id because that
-- would mean one HNSW per user, which doesn't scale.
CREATE INDEX IF NOT EXISTS entries_embedding_hnsw
  ON entries USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS cards_question_embedding_hnsw
  ON cards USING hnsw (question_embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS notes_embedding_hnsw
  ON notes USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS answer_evaluations_gaps_embedding_hnsw
  ON answer_evaluations USING hnsw (gaps_embedding extensions.vector_cosine_ops);

-- 3. Operational view — quick "did embed-on-write keep up?" check.
--    SELECT * FROM embedding_coverage;
CREATE OR REPLACE VIEW embedding_coverage AS
  SELECT 'entries'::text            AS source, COUNT(*) AS total, COUNT(embedding)          AS embedded FROM entries
  UNION ALL
  SELECT 'cards'::text,                         COUNT(*),         COUNT(question_embedding)            FROM cards
  UNION ALL
  SELECT 'notes'::text,                         COUNT(*),         COUNT(embedding)                     FROM notes
  UNION ALL
  SELECT 'answer_evaluations'::text,            COUNT(*),         COUNT(gaps_embedding)                FROM answer_evaluations;
