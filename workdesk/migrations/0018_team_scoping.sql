-- ─────────────────────────────────────────────────────────────────────────────
-- 0018_team_scoping
--
-- Adds room_id to every table that is team-scoped. This makes team_rooms the
-- primary tenant boundary: all data queries filter by room_id so users can
-- never see another team's data.
--
-- Tables receiving room_id:
--   sets, artifacts, bulletins, library_sections,
--   conversations, activity_events, artifact_relationships
--
-- Tables NOT receiving room_id (inherit scope through joins or are global):
--   versions             → scoped through artifacts
--   countdown_assignments→ scoped through bulletins
--   library_artifacts    → scoped through library_sections
--   library_subscriptions→ per-user preference
--   messages             → scoped through conversations
--   conversation_members → scoped through conversations
--   artifact_shares      → references artifacts (already scoped)
--   artifact_accesses    → per-user "recently opened" (personal)
--   notifications        → per-user delivery
--   users, team_rooms, room_memberships → the identity/scoping layer itself
--   audit_logs           → org-wide, actor-based
--   storage_*            → org-wide
--
-- Backfill strategy:
--   1. Add column as nullable.
--   2. Backfill: for each row, pick the owner/author's first room by joined_at.
--      For conversations: find any room shared by both members.
--   3. Delete rows that cannot be assigned (orphaned data — no common room).
--   4. Set NOT NULL + add indexes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. sets ───────────────────────────────────────────────────────────────────
ALTER TABLE sets ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

UPDATE sets s
SET room_id = rm.room_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, room_id
  FROM room_memberships
  ORDER BY user_id, joined_at ASC
) rm
WHERE s.owner_id = rm.user_id AND s.room_id IS NULL;

DELETE FROM sets WHERE room_id IS NULL;
ALTER TABLE sets ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS sets_room_id_idx ON sets (room_id) WHERE deleted_at IS NULL;

-- ── 2. artifacts ──────────────────────────────────────────────────────────────
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

UPDATE artifacts a
SET room_id = rm.room_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, room_id
  FROM room_memberships
  ORDER BY user_id, joined_at ASC
) rm
WHERE a.owner_id = rm.user_id AND a.room_id IS NULL;

DELETE FROM artifacts WHERE room_id IS NULL;
ALTER TABLE artifacts ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS artifacts_room_id_idx ON artifacts (room_id) WHERE deleted_at IS NULL;

-- ── 3. bulletins ─────────────────────────────────────────────────────────────
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

UPDATE bulletins b
SET room_id = rm.room_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, room_id
  FROM room_memberships
  ORDER BY user_id, joined_at ASC
) rm
WHERE b.author_id = rm.user_id AND b.room_id IS NULL;

DELETE FROM bulletins WHERE room_id IS NULL;
ALTER TABLE bulletins ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS bulletins_room_id_idx ON bulletins (room_id);

-- ── 4. library_sections ───────────────────────────────────────────────────────
ALTER TABLE library_sections ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

UPDATE library_sections ls
SET room_id = rm.room_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, room_id
  FROM room_memberships
  ORDER BY user_id, joined_at ASC
) rm
WHERE ls.created_by = rm.user_id AND ls.room_id IS NULL;

DELETE FROM library_sections WHERE room_id IS NULL;
ALTER TABLE library_sections ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS library_sections_room_id_idx ON library_sections (room_id);

-- ── 5. conversations ──────────────────────────────────────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

-- For conversations: find a room shared by both members.
UPDATE conversations c
SET room_id = shared.room_id
FROM (
  SELECT DISTINCT ON (c2.id) c2.id AS conv_id, rm1.room_id
  FROM conversations c2
  JOIN conversation_members cm1 ON cm1.conversation_id = c2.id
  JOIN conversation_members cm2 ON cm2.conversation_id = c2.id AND cm2.user_id <> cm1.user_id
  JOIN room_memberships rm1 ON rm1.user_id = cm1.user_id
  JOIN room_memberships rm2 ON rm2.user_id = cm2.user_id AND rm2.room_id = rm1.room_id
  ORDER BY c2.id, rm1.joined_at ASC
) shared
WHERE c.id = shared.conv_id AND c.room_id IS NULL;

DELETE FROM conversation_members WHERE conversation_id IN (SELECT id FROM conversations WHERE room_id IS NULL);
DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE room_id IS NULL);
DELETE FROM conversations WHERE room_id IS NULL;
ALTER TABLE conversations ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_room_id_idx ON conversations (room_id);

-- ── 6. activity_events ────────────────────────────────────────────────────────
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

UPDATE activity_events ae
SET room_id = rm.room_id
FROM (
  SELECT DISTINCT ON (user_id) user_id, room_id
  FROM room_memberships
  ORDER BY user_id, joined_at ASC
) rm
WHERE ae.user_id = rm.user_id AND ae.room_id IS NULL;

DELETE FROM activity_events WHERE room_id IS NULL;
ALTER TABLE activity_events ALTER COLUMN room_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS activity_events_room_id_idx ON activity_events (room_id);

-- ── 7. artifact_relationships ─────────────────────────────────────────────────
-- Only if the table exists (it may not in all environments).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'artifact_relationships') THEN
    ALTER TABLE artifact_relationships ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES team_rooms(id) ON DELETE RESTRICT;

    UPDATE artifact_relationships ar
    SET room_id = rm.room_id
    FROM (
      SELECT DISTINCT ON (user_id) user_id, room_id
      FROM room_memberships
      ORDER BY user_id, joined_at ASC
    ) rm
    JOIN artifacts a ON a.id = ar.source_artifact_id
    WHERE a.owner_id = rm.user_id AND ar.room_id IS NULL;

    DELETE FROM artifact_relationships WHERE room_id IS NULL;
    ALTER TABLE artifact_relationships ALTER COLUMN room_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS artifact_relationships_room_id_idx ON artifact_relationships (room_id);
  END IF;
END $$;
