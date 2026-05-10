-- ============================================
-- LearnDaily — RESET DATA ONLY
--
-- Wipes all user/seed rows while preserving:
--   - Table schemas, indexes, triggers, FKs, CHECK constraints
--   - The `vector` extension + pgvector columns (embedding, question_embedding,
--     gaps_embedding) and their HNSW indexes
--   - All match_* RPC functions (009_match_functions.sql)
--   - The default mock user row in `profiles`
--     (id = 00000000-0000-0000-0000-000000000000)
--
-- Embedding model is configured in app code/env (text-embedding-004,
-- 768 dims) — this script does NOT touch model config or env.
--
-- Run this in the Supabase SQL Editor.
-- ============================================

BEGIN;

-- TRUNCATE ... CASCADE handles FK fan-out (e.g. truncating entries also
-- empties cards -> mock_interview_questions, card_reviews, etc.).
-- RESTART IDENTITY is harmless here (we use UUID PKs) but kept for safety
-- if any future serial columns are added.
TRUNCATE TABLE
  entries,
  cards,
  revision_sessions,
  card_reviews,
  mock_interviews,
  mock_interview_questions,
  mock_interview_turns,
  mock_interview_code_submissions,
  interview_log,
  answer_evaluations,
  notes,
  note_todos,
  notes_weekly_summaries,
  knowledge_gap_analyses,
  system_design_reviews
RESTART IDENTITY CASCADE;

-- Reset the default mock user's streak counters but keep the row so the
-- app continues to work without auth (matches migration 001 behaviour).
UPDATE profiles
SET    streak_count = 0,
       last_active_date = NULL
WHERE  id = '00000000-0000-0000-0000-000000000000';

-- Re-insert the default mock user in case it was somehow removed.
INSERT INTO profiles (id, display_name, streak_count)
VALUES ('00000000-0000-0000-0000-000000000000', 'Local User', 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================
-- Sanity checks (run these after the reset to confirm clean state).
-- ============================================
-- SELECT 'entries' AS t, COUNT(*) FROM entries
-- UNION ALL SELECT 'cards', COUNT(*) FROM cards
-- UNION ALL SELECT 'revision_sessions', COUNT(*) FROM revision_sessions
-- UNION ALL SELECT 'card_reviews', COUNT(*) FROM card_reviews
-- UNION ALL SELECT 'mock_interviews', COUNT(*) FROM mock_interviews
-- UNION ALL SELECT 'mock_interview_questions', COUNT(*) FROM mock_interview_questions
-- UNION ALL SELECT 'mock_interview_turns', COUNT(*) FROM mock_interview_turns
-- UNION ALL SELECT 'mock_interview_code_submissions', COUNT(*) FROM mock_interview_code_submissions
-- UNION ALL SELECT 'interview_log', COUNT(*) FROM interview_log
-- UNION ALL SELECT 'answer_evaluations', COUNT(*) FROM answer_evaluations
-- UNION ALL SELECT 'notes', COUNT(*) FROM notes
-- UNION ALL SELECT 'note_todos', COUNT(*) FROM note_todos
-- UNION ALL SELECT 'notes_weekly_summaries', COUNT(*) FROM notes_weekly_summaries
-- UNION ALL SELECT 'knowledge_gap_analyses', COUNT(*) FROM knowledge_gap_analyses
-- UNION ALL SELECT 'system_design_reviews', COUNT(*) FROM system_design_reviews
-- UNION ALL SELECT 'profiles', COUNT(*) FROM profiles;
--
-- Expected: every count is 0 except profiles = 1.
--
-- Embedding coverage view should show all zeros too:
-- SELECT * FROM embedding_coverage;
