-- ============================================
-- Phase 3: Daily Notes & TODOs
-- A lightweight daily journal sitting alongside Entries.
-- Entries = titled, categorized study notes that generate AI cards.
-- Notes   = one row per calendar day per user; free-form text + checklist.
-- Run this in Supabase SQL Editor.
-- ============================================

-- 1. Daily notes — one per calendar day per user.
-- We don't soft-delete; if the user clears the content, the row stays so the
-- calendar strip can keep "had notes" history. To remove a day entirely, the
-- UI would have to delete the row explicitly (not exposed in v1).
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Calendar day in the user's local sense. We store as DATE (no timezone)
  -- and let the client decide which date "today" means. This keeps queries
  -- trivial and avoids per-user timezone bookkeeping for v1.
  day DATE NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, day)
);

ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notes_user_day ON notes(user_id, day DESC);

-- Full-text search across notes content. tsvector is computed inline (no
-- generated column) — plenty fast at the volumes we expect (one row/day
-- per user). If we ever index millions, switch to a STORED generated column.
CREATE INDEX IF NOT EXISTS idx_notes_content_fts
  ON notes USING GIN (to_tsvector('english', content));

-- 2. Per-day TODOs.
-- TODOs belong to a specific note (which means a specific day). To carry
-- over an unfinished item, we copy the row into the new day's note and
-- record the source via `carried_from_note_id` for provenance / undo.
CREATE TABLE IF NOT EXISTS note_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  -- Used to keep manual ordering stable; new items append to the end.
  position INT NOT NULL DEFAULT 0,
  -- If this todo was carried over from a previous day, point back to it.
  carried_from_note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE note_todos DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_note_todos_note ON note_todos(note_id, position);
CREATE INDEX IF NOT EXISTS idx_note_todos_user_open ON note_todos(user_id, done, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_todos_label_fts
  ON note_todos USING GIN (to_tsvector('english', label));

-- 3. updated_at trigger reuses the function defined in migration 001.
DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
