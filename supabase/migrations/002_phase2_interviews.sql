-- ============================================
-- Phase 2: Mock Interviews & Interview Log
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Mock Interview Sessions
CREATE TABLE IF NOT EXISTS mock_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('dsa', 'system_design', 'mixed', 'behavioral')),
  time_limit_minutes INT NOT NULL,
  total_questions INT NOT NULL,
  questions_answered INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  score_percent INT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE mock_interviews DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mock_interviews_user ON mock_interviews(user_id, started_at DESC);

-- 2. Mock Interview Questions (tracks each question in a mock session)
CREATE TABLE IF NOT EXISTS mock_interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mock_interview_id UUID NOT NULL REFERENCES mock_interviews(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  user_answer TEXT,
  explanation TEXT,
  is_correct BOOLEAN,
  time_taken_seconds INT,
  answered_at TIMESTAMPTZ
);

ALTER TABLE mock_interview_questions DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_mock_questions_interview ON mock_interview_questions(mock_interview_id, question_order);

-- 3. Interview Log (Company Tracker)
CREATE TABLE IF NOT EXISTS interview_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  interview_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'offer', 'rejected', 'cancelled')),
  topics TEXT[] DEFAULT '{}',
  notes TEXT,
  reflection TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  result_rating INT CHECK (result_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE interview_log DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_interview_log_user ON interview_log(user_id, interview_date DESC);

-- Updated_at trigger for interview_log
DROP TRIGGER IF EXISTS interview_log_updated_at ON interview_log;
CREATE TRIGGER interview_log_updated_at
  BEFORE UPDATE ON interview_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
