import { query, queryOne } from "@/lib/db";
import type { ActivityEvent, EmitActivityPayload, RecentlyOpenedItem } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Activity Service
//
// Two concerns:
//   1. Access log (artifact_accesses) — upsert on open, power "Recently Opened"
//   2. Activity feed (activity_events) — append on significant ops
//
// Both are non-blocking: callers fire-and-forget via `.catch(console.error)`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * recordOpen — upsert the access record for a user + artifact.
 * Non-throwing; intended for fire-and-forget use.
 */
export async function recordOpen(userId: string, artifactId: string): Promise<void> {
  await query(
    `INSERT INTO artifact_accesses (user_id, artifact_id, opened_at, open_count)
     VALUES ($1, $2, now(), 1)
     ON CONFLICT (user_id, artifact_id)
     DO UPDATE SET opened_at = now(), open_count = artifact_accesses.open_count + 1`,
    [userId, artifactId]
  );
}

/**
 * getRecentlyOpened — most recently opened artifacts for a user (up to `limit`).
 * Joins artifact table to include title/type; skips soft-deleted artifacts.
 */
export async function getRecentlyOpened(userId: string, roomId: string, limit = 10): Promise<RecentlyOpenedItem[]> {
  const rows = await query<{
    artifact_id: string;
    title: string;
    type: string;
    opened_at: Date;
    open_count: string;
  }>(
    `SELECT aa.artifact_id, a.title, a.type, aa.opened_at, aa.open_count
     FROM artifact_accesses aa
     JOIN artifacts a ON a.id = aa.artifact_id
     WHERE aa.user_id = $1
       AND a.room_id = $2
       AND a.deleted_at IS NULL
     ORDER BY aa.opened_at DESC
     LIMIT $3`,
    [userId, roomId, limit]
  );

  return rows.map((r) => ({
    artifactId: r.artifact_id,
    title: r.title,
    type: r.type,
    openedAt: r.opened_at,
    openCount: Number(r.open_count),
  }));
}

/**
 * emitActivityEvent — insert a row into activity_events.
 * Non-throwing; intended for fire-and-forget use.
 */
export async function emitActivityEvent(payload: EmitActivityPayload): Promise<void> {
  await query(
    `INSERT INTO activity_events (user_id, event_type, artifact_id, set_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      payload.userId,
      payload.eventType,
      payload.artifactId ?? null,
      payload.setId ?? null,
      JSON.stringify(payload.details ?? {}),
    ]
  );
}

/**
 * getActivityFeed — recent activity events for a user in the active room.
 */
export async function getActivityFeed(userId: string, roomId: string, limit = 20): Promise<ActivityEvent[]> {
  const rows = await query<{
    id: string;
    user_id: string;
    event_type: string;
    artifact_id: string | null;
    set_id: string | null;
    details: Record<string, unknown>;
    created_at: Date;
    title: string | null;
  }>(
    `SELECT ae.id, ae.user_id, ae.event_type, ae.artifact_id, ae.set_id,
            ae.details, ae.created_at,
            COALESCE(a.title, s.name) AS title
     FROM activity_events ae
     LEFT JOIN artifacts a ON a.id = ae.artifact_id
     LEFT JOIN sets      s ON s.id = ae.set_id
     WHERE ae.user_id = $1
       AND ae.room_id = $2
     ORDER BY ae.created_at DESC
     LIMIT $3`,
    [userId, roomId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    eventType: r.event_type as ActivityEvent["eventType"],
    artifactId: r.artifact_id,
    setId: r.set_id,
    details: typeof r.details === "string" ? JSON.parse(r.details) : r.details,
    createdAt: r.created_at,
    title: r.title ?? undefined,
  }));
}
