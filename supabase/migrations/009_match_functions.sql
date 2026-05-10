-- ============================================
-- Phase 6: pgvector — match_* RPC functions
--
-- PostgREST does not let us use pgvector operators (`<=>`) directly in the
-- supabase-js query builder, so the supported pattern is to put similarity
-- search inside SQL functions and call them via supabase.rpc(...).
--
-- Each function follows the same shape:
--   - Inputs:  query_embedding vector(768), match_threshold float,
--              match_count int, filter_user_id uuid
--   - Filters: rows of `filter_user_id` AND embedding column IS NOT NULL
--   - Score:   1 - (embedding <=> query) AS similarity (0..1, higher = more similar)
--   - Order:   embedding <=> query ASC (must be the same expression so the
--              planner can use the HNSW index)
--   - Limit:   match_count
--
-- security invoker (the default for SQL functions): the function runs with
-- the caller's privileges. RLS is currently disabled on these tables (see
-- migration 001), but when we turn it on the functions will respect the
-- caller's policies without needing changes here.
--
-- Run this in Supabase SQL Editor.
-- ============================================

-- ---------------------------------------------------------------
-- entries — used by hybrid search and RAG into the mock interviewer.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_entries_filtered (
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count     int,
  filter_user_id  uuid
)
RETURNS TABLE (
  id           uuid,
  title        text,
  content      text,
  category     text,
  subcategory  text,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.title,
    e.content,
    e.category,
    e.subcategory,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE
    e.user_id = filter_user_id
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------
-- cards — used to suppress duplicate AI-generated questions before insert.
-- Caller should bump hnsw.ef_search inside a transaction for this one
-- since false negatives mean a duplicate card lands in the deck.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_cards_filtered (
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count     int,
  filter_user_id  uuid
)
RETURNS TABLE (
  id           uuid,
  question     text,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.question,
    1 - (c.question_embedding <=> query_embedding) AS similarity
  FROM cards c
  WHERE
    c.user_id = filter_user_id
    AND c.question_embedding IS NOT NULL
    AND 1 - (c.question_embedding <=> query_embedding) > match_threshold
  ORDER BY c.question_embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------
-- notes — used by hybrid search alongside the existing FTS index.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_notes_filtered (
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count     int,
  filter_user_id  uuid
)
RETURNS TABLE (
  id           uuid,
  day          date,
  content      text,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    n.id,
    n.day,
    n.content,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM notes n
  WHERE
    n.user_id = filter_user_id
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------
-- answer_evaluations.gaps — drives the Knowledge Gap Analyzer's
-- recurring-weakness clustering. Returns enough context for the
-- aggregator to skip a hydrate round-trip.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_eval_gaps_filtered (
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count     int,
  filter_user_id  uuid
)
RETURNS TABLE (
  id            uuid,
  gaps          jsonb,
  verdict       text,
  overall_score int,
  created_at    timestamptz,
  similarity    float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ae.id,
    ae.gaps,
    ae.verdict,
    ae.overall_score,
    ae.created_at,
    1 - (ae.gaps_embedding <=> query_embedding) AS similarity
  FROM answer_evaluations ae
  WHERE
    ae.user_id = filter_user_id
    AND ae.gaps_embedding IS NOT NULL
    AND 1 - (ae.gaps_embedding <=> query_embedding) > match_threshold
  ORDER BY ae.gaps_embedding <=> query_embedding
  LIMIT match_count;
$$;
