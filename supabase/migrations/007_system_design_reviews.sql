-- ============================================
-- Phase 5: AI System Design Review & Critique
--
-- The user picks (or is given) a system design problem, draws their
-- architecture on a draw.io-style canvas, and submits. Gemini judges the
-- design across the standard staff-level system design rubric and asks
-- Socratic follow-up questions ("What happens when this DB goes down?",
-- "How does the cache stay consistent across regions?") that the user
-- answers in a chat thread.
--
-- We persist:
--   1. The problem prompt + canvas graph (nodes/edges JSON)
--   2. The AI critique report (rubric, strengths, issues, follow-up Qs)
--   3. The follow-up Q&A transcript (so re-opening a review shows full state)
--
-- One row per session. Drafts are kept (status = 'draft') until the user
-- submits, then status -> 'reviewed'. Re-running critique creates a new
-- report version on the same row.
-- Run this in Supabase SQL Editor.
-- ============================================

CREATE TABLE IF NOT EXISTS system_design_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Problem statement (e.g. "Design a URL shortener that handles 10k QPS").
  -- We persist the full text so re-grading later still has the original brief
  -- even if we change problem templates.
  problem_title TEXT NOT NULL,
  problem_brief TEXT NOT NULL,
  -- Optional template id when the problem came from a built-in catalog.
  problem_template TEXT,

  -- The full canvas graph.
  -- {
  --   nodes: [{ id, type, label, notes, x, y, width, height, color }],
  --   edges: [{ id, source, target, label, kind: 'sync'|'async'|'replication'|'data', notes }],
  --   viewport?: { zoom, pan_x, pan_y }
  -- }
  diagram JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,

  -- AI critique report. Shape:
  -- {
  --   overall_score: 0-100,
  --   verdict: 'strong'|'solid'|'workable'|'gaps'|'weak',
  --   rubric: { scalability, availability, consistency, data_model,
  --             bottlenecks, distributed_tradeoffs, operational }: { score 0-5, feedback },
  --   strengths: [string],
  --   issues: [{ severity, area, observation, suggestion, references_node_id? }],
  --   follow_up_questions: [{ id, question, focus_area, expected_signals: [string] }],
  --   improved_design_hint: string,
  --   model_used: string
  -- }
  report JSONB,

  -- Q&A thread the AI runs after the report. Each entry:
  -- { id, question_id, question, user_answer, ai_evaluation: { score 0-5, feedback, follow_up?: string }, answered_at }
  qa_thread JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 'draft'    -> user is still drawing
  -- 'reviewed' -> AI report exists
  -- 'archived' -> hidden from default list
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','archived')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE system_design_reviews DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sdr_user_updated
  ON system_design_reviews (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sdr_status
  ON system_design_reviews (user_id, status, updated_at DESC);

-- Touch updated_at on row updates so the listing stays sorted by recency.
CREATE OR REPLACE FUNCTION sdr_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sdr_touch_updated_at_trigger ON system_design_reviews;
CREATE TRIGGER sdr_touch_updated_at_trigger
  BEFORE UPDATE ON system_design_reviews
  FOR EACH ROW EXECUTE FUNCTION sdr_touch_updated_at();
