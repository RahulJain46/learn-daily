-- ============================================
-- Phase 4: Knowledge Gap Analyzer
-- Stores AI-generated diagnostic snapshots that synthesise signals from
-- entries, card_reviews, answer_evaluations, and mock_interviews into a
-- prioritised list of weak topics + a study plan.
--
-- Why a separate table (vs. recomputing on each page view):
--   - The synthesis prompt is the most expensive call in the app (full
--     transcripts + rubrics fed to the deep model). We only want to run it
--     when the user explicitly asks, and we want the dashboard / gap page
--     to render instantly from the last snapshot.
--   - Snapshots are also useful longitudinally — "you said FSRS was a gap
--     2 weeks ago, here's what changed since."
-- Run this in Supabase SQL Editor.
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_gap_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Window the analysis covers. We default to "all time" but persist the
  -- bounds so older snapshots remain interpretable if we add filters later.
  window_start TIMESTAMPTZ,
  window_end   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Numeric snapshot of the inputs at the time of analysis. Lets us show
  -- "based on 47 reviews, 12 evaluations, 3 mock interviews" without
  -- recomputing.
  signals_summary JSONB NOT NULL,

  -- Top-line readout the dashboard card uses.
  -- { overall_readiness: 0-100, level: 'foundational'|'developing'|'proficient'|'advanced',
  --   headline: string, one_liner: string }
  readout JSONB NOT NULL,

  -- Ranked list of weak areas. Each item:
  -- { topic, category, severity: 'critical'|'high'|'medium'|'low',
  --   evidence: [strings], suggested_actions: [strings],
  --   confidence: 0-1 }
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Things the user is doing well — important for motivation and so the UI
  -- doesn't read as purely negative.
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Concrete next-7-days plan. Each item:
  -- { day: 1..7, focus: string, action: string, est_minutes: int,
  --   linked_entries: [uuid] (optional) }
  study_plan JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Cross-cutting rubric weaknesses derived from answer_evaluations
  -- (e.g. "tradeoff_awareness averages 1.8/5 — lowest dimension").
  rubric_weakness JSONB NOT NULL DEFAULT '[]'::jsonb,

  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_gap_analyses DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_kga_user_created
  ON knowledge_gap_analyses (user_id, created_at DESC);
