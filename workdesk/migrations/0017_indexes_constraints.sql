-- ─────────────────────────────────────────────────────────────────────────────
-- 0017_indexes_constraints
--
-- Adds the five missing indexes identified in the architecture audit, plus a
-- DB-level CHECK constraint that prevents a set from being its own parent.
--
-- All indexes use IF NOT EXISTS so the migration is safely re-runnable.
-- The ALTER TABLE is guarded by a DO block for the same reason.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Soft-delete hot path on sets ──────────────────────────────────────────
--
-- Queries like:
--   WHERE owner_id = $1 AND deleted_at IS NULL
--   WHERE parent_id = ANY(...) AND deleted_at IS NULL
-- currently scan all rows for that owner. A partial index on live rows only
-- keeps the index small and fast.
CREATE INDEX IF NOT EXISTS sets_live_owner_idx
  ON sets (owner_id, name)
  WHERE deleted_at IS NULL;

-- ── 2. messages.sender_id + created_at ───────────────────────────────────────
--
-- "Messages from user X" sorted by recency scans the full messages table.
CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON messages (sender_id, created_at DESC);

-- ── 3. conversations.updated_at ──────────────────────────────────────────────
--
-- "List conversations sorted by most recent activity" ORDER BY updated_at DESC
-- does a seq-scan + sort without this index.
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx
  ON conversations (updated_at DESC);

-- ── 4. artifact_accesses per-artifact recency ────────────────────────────────
--
-- "Recently opened versions of artifact X" needs (artifact_id, opened_at DESC).
-- The existing index is on (user_id, opened_at DESC) only.
CREATE INDEX IF NOT EXISTS artifact_accesses_artifact_recent_idx
  ON artifact_accesses (artifact_id, opened_at DESC);

-- ── 5. library_sections.created_by ───────────────────────────────────────────
--
-- "Sections I created" filter used in library admin views.
CREATE INDEX IF NOT EXISTS library_sections_creator_idx
  ON library_sections (created_by);

-- ── 6. Self-parent guard on sets ─────────────────────────────────────────────
--
-- Enforces at the DB level that a folder cannot be its own parent.
-- The circular-reference check in archiveService already prevents this in
-- the update path, but a DB constraint is cheaper and cannot be bypassed.
DO $$ BEGIN
  ALTER TABLE sets
    ADD CONSTRAINT sets_no_self_parent
    CHECK (parent_id IS NULL OR parent_id <> id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
