-- ─────────────────────────────────────────────────────────────────────────────
-- 0016_team_rooms
--
-- Introduces the Team Room concept — the organisational unit that scopes all
-- future WorkDesk modules (Archive, Library, Messaging, Bulletins, etc.).
--
-- Tables:
--   team_rooms        — one row per room (name, join code, owner)
--   room_memberships  — many-to-many: user ↔ room, with role
--
-- Design decisions:
--   * join_code is 32 chars, cryptographically random, stored plain (not hashed)
--     because it is not a secret credential — it is a shareable invite code.
--     UNIQUE constraint enforces no collisions.
--   * room_memberships has a composite PK (room_id, user_id) — a user can only
--     belong to a room once.
--   * ON DELETE RESTRICT on all FKs — rooms and memberships must be explicitly
--     cleaned up; no accidental cascades.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enum ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE room_member_role AS ENUM ('OWNER', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── team_rooms ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_rooms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  join_code  TEXT        NOT NULL UNIQUE,
  owner_id   UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_rooms_owner_id_idx  ON team_rooms (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_rooms_join_code_uidx ON team_rooms (join_code);

-- ── room_memberships ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_memberships (
  room_id   UUID             NOT NULL REFERENCES team_rooms (id) ON DELETE RESTRICT,
  user_id   UUID             NOT NULL REFERENCES users (id)      ON DELETE RESTRICT,
  role      room_member_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_memberships_user_id_idx ON room_memberships (user_id);
CREATE INDEX IF NOT EXISTS room_memberships_room_id_idx ON room_memberships (room_id);
