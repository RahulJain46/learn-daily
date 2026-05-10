-- ============================================
-- Weekly notes summary cache.
-- The dashboard widget would otherwise hit Gemini on every load, blowing
-- through free-tier RPM. We cache by ISO week-start date (Monday).
-- ============================================

CREATE TABLE IF NOT EXISTS notes_weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Monday of the summarized week (YYYY-MM-DD).
  week_start DATE NOT NULL,
  -- Structured payload produced by the AI:
  --   { headline, themes: [{title, detail}], todos_done: int,
  --     todos_carried: int, days_logged: int, suggestion }
  summary JSONB NOT NULL,
  -- Hash of the inputs (note ids + content lengths + done counts). When the
  -- week is still "live" (current week), we re-run the summary if the inputs
  -- have changed since the last cached run.
  inputs_hash TEXT NOT NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE notes_weekly_summaries DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_user
  ON notes_weekly_summaries(user_id, week_start DESC);
