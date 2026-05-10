-- Phase 3: AI Answer Evaluator
-- Persists Gemini-powered staff-level rubric evaluations of user answers
-- so we can show history, trends, and identify weak rubric dimensions over time.

create table if not exists answer_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  card_id uuid not null references cards(id) on delete cascade,
  session_id uuid references revision_sessions(id) on delete set null,

  user_answer text not null,
  overall_score integer not null check (overall_score between 0 and 100),
  verdict text not null check (verdict in ('excellent','strong','adequate','weak','incorrect')),

  -- Full rubric blob: { technical_accuracy: {score, feedback}, depth: {...}, ... }
  rubric jsonb not null,

  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  improved_answer text,
  follow_up_questions jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists answer_evaluations_user_created_idx
  on answer_evaluations (user_id, created_at desc);

create index if not exists answer_evaluations_card_idx
  on answer_evaluations (card_id);

create index if not exists answer_evaluations_session_idx
  on answer_evaluations (session_id);
