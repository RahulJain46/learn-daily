-- ============================================
-- Phase 2: AI Mock Interview Conversationalist
-- Adds conversational mode + code submissions on top of mock_interviews.
-- Run this in Supabase SQL Editor.
-- ============================================

-- 1. Per-turn conversation log
--
-- The existing `mock_interview_questions` table is per-card (one row per
-- pre-canned card). The conversational interviewer doesn't use cards; it
-- generates questions/follow-ups dynamically. We capture the dialogue here
-- as an ordered transcript of turns.
CREATE TABLE IF NOT EXISTS mock_interview_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_interview_id UUID NOT NULL REFERENCES mock_interviews(id) ON DELETE CASCADE,
  turn_index INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('interviewer', 'candidate', 'system')),
  content TEXT NOT NULL,
  -- Lightweight per-turn signal the interviewer model emits internally,
  -- e.g. { coverage, probe_depth, clarity } each 0-5. Not surfaced live
  -- (end-only feedback) but used to weight the final report.
  per_turn_signal JSONB,
  -- If the candidate submitted code on this turn, link to the submission.
  code_submission_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (mock_interview_id, turn_index)
);

ALTER TABLE mock_interview_turns DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mi_turns_interview ON mock_interview_turns(mock_interview_id, turn_index);

-- 2. Code submissions
--
-- Each coding question can have multiple submissions (run, edit, run again).
-- We keep them all so the final report can show iteration count and
-- whether the candidate stabilized after seeing test failures.
CREATE TABLE IF NOT EXISTS mock_interview_code_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_interview_id UUID NOT NULL REFERENCES mock_interviews(id) ON DELETE CASCADE,
  -- Which interviewer turn (i.e. which coding question) this is for.
  prompt_turn_index INT NOT NULL,
  language TEXT NOT NULL DEFAULT 'javascript',
  code TEXT NOT NULL,
  -- Tests are stored alongside the submission so the report can replay
  -- exactly what the user saw, even if the AI re-rolls tests later.
  test_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Run results from the in-browser sandbox. Shape:
  -- { passed: int, total: int, results: [{name, passed, expected, actual, error?}], stdout, runtime_ms }
  run_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mock_interview_code_submissions DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mi_code_interview ON mock_interview_code_submissions(mock_interview_id, prompt_turn_index, created_at DESC);

-- Now that the submissions table exists, wire the FK from turns -> submissions.
ALTER TABLE mock_interview_turns
  DROP CONSTRAINT IF EXISTS mock_interview_turns_code_submission_fk;
ALTER TABLE mock_interview_turns
  ADD CONSTRAINT mock_interview_turns_code_submission_fk
  FOREIGN KEY (code_submission_id)
  REFERENCES mock_interview_code_submissions(id)
  ON DELETE SET NULL;

-- 3. Extend mock_interviews for conversational sessions
--
-- We don't widen the `mode` CHECK; the existing modes (dsa, system_design,
-- mixed, behavioral) all still apply. The boolean flag distinguishes the
-- two flows so the listing page can route Resume to the right URL.
ALTER TABLE mock_interviews
  ADD COLUMN IF NOT EXISTS conversation_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_report JSONB,
  -- Snapshot of the interviewer persona used (so reports remain reproducible
  -- if we change prompts later).
  ADD COLUMN IF NOT EXISTS interviewer_persona TEXT;

-- Helpful when the dashboard filters "show me my conversational sessions"
CREATE INDEX IF NOT EXISTS idx_mock_interviews_conversational
  ON mock_interviews(user_id, started_at DESC)
  WHERE conversation_mode = true;
