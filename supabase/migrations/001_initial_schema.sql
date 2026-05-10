-- ============================================
-- LearnDaily Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles table
-- NOTE: No FK to auth.users for now — allows app to work without login.
-- Re-add "REFERENCES auth.users(id) ON DELETE CASCADE" when enabling auth.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  streak_count INT DEFAULT 0,
  last_active_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS disabled for now (no auth)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Insert a default mock user so the app works without signup
INSERT INTO profiles (id, display_name, streak_count)
VALUES ('00000000-0000-0000-0000-000000000000', 'Local User', 0)
ON CONFLICT (id) DO NOTHING;

-- 2. Learning Entries
CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('dsa', 'system_design', 'backend', 'frontend', 'ai', 'concepts', 'languages')),
  subcategory TEXT,
  tags TEXT[] DEFAULT '{}',
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE entries DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(user_id, category);

-- 3. Revision Cards (questions)
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'short_answer', 'flashcard')),
  question TEXT NOT NULL,
  options JSONB,
  answer TEXT NOT NULL,
  -- FSRS scheduling fields
  stability REAL DEFAULT 0,
  difficulty_score REAL DEFAULT 0,
  elapsed_days INT DEFAULT 0,
  scheduled_days INT DEFAULT 0,
  reps INT DEFAULT 0,
  lapses INT DEFAULT 0,
  state INT DEFAULT 0,
  due TIMESTAMPTZ DEFAULT now(),
  last_review TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cards DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cards_user_due ON cards(user_id, due);
CREATE INDEX IF NOT EXISTS idx_cards_entry ON cards(entry_id);

-- 4. Revision Sessions
CREATE TABLE IF NOT EXISTS revision_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  category TEXT,
  cards_reviewed INT DEFAULT 0,
  correct_count INT DEFAULT 0,
  duration_seconds INT,
  completed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE revision_sessions DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON revision_sessions(user_id, completed_at DESC);

-- 5. Individual Card Reviews (for analytics)
CREATE TABLE IF NOT EXISTS card_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES revision_sessions(id) ON DELETE SET NULL,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_answer TEXT,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 4),
  time_taken_ms INT,
  reviewed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE card_reviews DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reviews_card ON card_reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_reviews_session ON card_reviews(session_id);

-- 6. Updated_at trigger for entries
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entries_updated_at ON entries;
CREATE TRIGGER entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
