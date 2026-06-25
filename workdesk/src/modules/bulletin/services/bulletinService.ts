import { query, queryOne, transaction } from "@/lib/db";
import { AuditAction, CountdownStatus } from "@/lib/enums";
import { emitActivityEvent } from "@/modules/activity/services/activityService";
import { emitNotification } from "@/modules/notifications/services/notificationService";
import type { BulletinSummary, BulletinDetail, CountdownAssignment } from "../types";
import type { CreateBulletinInput } from "../schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Bulletin Service
// ─────────────────────────────────────────────────────────────────────────────

// ── Typed errors ─────────────────────────────────────────────────────────────

export class BulletinNotFoundError extends Error {
  readonly code = "BULLETIN_NOT_FOUND";
  constructor() {
    super("Bulletin not found.");
    this.name = "BulletinNotFoundError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// ── Raw DB rows ───────────────────────────────────────────────────────────────

interface BulletinRow {
  id: string;
  author_id: string;
  author_name: string;
  type: string;
  title: string;
  body: string | null;
  due_at: Date | null;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
  total_assignees: string;
  completed_count: string;
  my_status: string | null;
}

interface AssignmentRow {
  id: string;
  bulletin_id: string;
  user_id: string;
  user_name: string;
  status: string;
  completed_at: Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToSummary(r: BulletinRow): BulletinSummary {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name,
    type: r.type as BulletinSummary["type"],
    title: r.title,
    body: r.body,
    dueAt: r.due_at,
    pinned: r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    totalAssignees: Number(r.total_assignees),
    completedCount: Number(r.completed_count),
    myStatus: r.my_status as CountdownStatus | null,
  };
}

async function writeAuditLog(
  action: string,
  actorId: string,
  targetId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1, $2, $3, $4)`,
      [action, actorId, targetId, JSON.stringify(details)]
    );
  } catch {
    // Audit failure must never block the operation.
  }
}

// ── markOverdue ───────────────────────────────────────────────────────────────
// Called inline on list — marks PENDING assignments past due_at as OVERDUE.

async function markOverdueAssignments(): Promise<void> {
  await query(
    `UPDATE countdown_assignments ca
     SET status = 'OVERDUE'
     FROM bulletins b
     WHERE ca.bulletin_id = b.id
       AND b.due_at < now()
       AND ca.status = 'PENDING'`,
    []
  );
}

// ── listBulletins ─────────────────────────────────────────────────────────────

export async function listBulletins(
  userId: string,
  roomId: string,
  opts: { limit?: number; cursor?: string } = {}
): Promise<BulletinSummary[]> {
  markOverdueAssignments().catch(() => {});

  const limit = opts.limit ?? 20;
  const cursorClause = opts.cursor
    ? `AND (b.pinned = false AND b.created_at < $4 OR b.pinned = true AND b.created_at < $4)`
    : "";
  const params: (string | number)[] = [userId, roomId, limit];
  if (opts.cursor) params.push(opts.cursor);

  const rows = await query<BulletinRow>(
    `SELECT b.id, b.author_id, u.name AS author_name,
            b.type, b.title, b.body, b.due_at, b.pinned,
            b.created_at, b.updated_at,
            COUNT(ca.id) FILTER (WHERE b.type = 'COUNTDOWN') AS total_assignees,
            COUNT(ca.id) FILTER (WHERE ca.status = 'COMPLETED') AS completed_count,
            (SELECT ca2.status FROM countdown_assignments ca2
             WHERE ca2.bulletin_id = b.id AND ca2.user_id = $1
             LIMIT 1) AS my_status
     FROM bulletins b
     JOIN users u ON u.id = b.author_id
     LEFT JOIN countdown_assignments ca ON ca.bulletin_id = b.id
     WHERE b.room_id = $2
     ${cursorClause}
     GROUP BY b.id, u.name
     ORDER BY b.pinned DESC, b.created_at DESC
     LIMIT $3`,
    params
  );

  return rows.map(rowToSummary);
}

// ── getBulletin ───────────────────────────────────────────────────────────────

export async function getBulletin(userId: string, bulletinId: string): Promise<BulletinDetail> {
  const row = await queryOne<BulletinRow>(
    `SELECT b.id, b.author_id, u.name AS author_name,
            b.type, b.title, b.body, b.due_at, b.pinned,
            b.created_at, b.updated_at,
            COUNT(ca.id) FILTER (WHERE b.type = 'COUNTDOWN') AS total_assignees,
            COUNT(ca.id) FILTER (WHERE ca.status = 'COMPLETED') AS completed_count,
            (SELECT ca2.status FROM countdown_assignments ca2
             WHERE ca2.bulletin_id = b.id AND ca2.user_id = $2
             LIMIT 1) AS my_status
     FROM bulletins b
     JOIN users u ON u.id = b.author_id
     LEFT JOIN countdown_assignments ca ON ca.bulletin_id = b.id
     WHERE b.id = $1
     GROUP BY b.id, u.name`,
    [bulletinId, userId]
  );
  if (!row) throw new BulletinNotFoundError();

  const assignments = await query<AssignmentRow>(
    `SELECT ca.id, ca.bulletin_id, ca.user_id, u.name AS user_name,
            ca.status, ca.completed_at
     FROM countdown_assignments ca
     JOIN users u ON u.id = ca.user_id
     WHERE ca.bulletin_id = $1
     ORDER BY u.name`,
    [bulletinId]
  );

  const mapped: CountdownAssignment[] = assignments.map((a) => ({
    id: a.id,
    bulletinId: a.bulletin_id,
    userId: a.user_id,
    userName: a.user_name,
    status: a.status as CountdownStatus,
    completedAt: a.completed_at,
  }));

  return { ...rowToSummary(row), assignments: mapped };
}

// ── createBulletin ────────────────────────────────────────────────────────────

export async function createBulletin(
  authorId: string,
  roomId: string,
  input: CreateBulletinInput
): Promise<BulletinSummary> {
  return transaction(async (tx) => {
    const { rows: bRows } = await tx.query<{
      id: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO bulletins (author_id, room_id, type, title, body, due_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at, updated_at`,
      [
        authorId,
        roomId,
        input.type,
        input.title,
        input.type === "COUNTDOWN" ? (input.body ?? null) : ((input as { body?: string | null }).body ?? null),
        input.type === "COUNTDOWN" ? new Date(input.dueAt) : null,
      ]
    );
    const bulletin = bRows[0];

    if (input.type === "COUNTDOWN" && input.assigneeIds.length > 0) {
      for (const uid of input.assigneeIds) {
        await tx.query(
          `INSERT INTO countdown_assignments (bulletin_id, user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [bulletin.id, uid]
        );
      }
    }

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        AuditAction.BULLETIN_CREATED,
        authorId,
        bulletin.id,
        JSON.stringify({ title: input.title, type: input.type }),
      ]
    );

    emitActivityEvent({
      userId: authorId,
      eventType: "BULLETIN_POSTED",
      details: { bulletinId: bulletin.id, title: input.title, type: input.type },
    }).catch(() => {});

    const { rows: authorRows } = await tx.query<{ name: string }>(
      `SELECT name FROM users WHERE id = $1`,
      [authorId]
    );

    // Emit COUNTDOWN_ASSIGNED activity + notification for each assignee (best-effort).
    if (input.type === "COUNTDOWN") {
      for (const uid of input.assigneeIds) {
        emitActivityEvent({
          userId: uid,
          eventType: "COUNTDOWN_ASSIGNED",
          details: { bulletinId: bulletin.id, title: input.title, dueAt: input.dueAt },
        }).catch(() => {});

        emitNotification(
          uid,
          "BULLETIN_POSTED",
          `You've been assigned: ${input.title}`,
          `Countdown due ${input.dueAt}`,
          { bulletinId: bulletin.id, bulletinTitle: input.title }
        ).catch(() => {});
      }
    }

    // Notify all other room members of the new bulletin (best-effort, outside tx).
    const authorName = authorRows[0]?.name ?? "Someone";
    query<{ id: string }>(
      `SELECT u.id FROM room_memberships rm JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $2 AND rm.user_id <> $1 AND u.status = 'ACTIVE'`,
      [authorId, roomId]
    ).then(members => {
      for (const m of members) {
        emitNotification(
          m.id,
          "BULLETIN_POSTED",
          `New bulletin: ${input.title}`,
          `Posted by ${authorName}`,
          { bulletinId: bulletin.id, bulletinTitle: input.title }
        ).catch(() => {});
      }
    }).catch(() => {});

    return {
      id: bulletin.id,
      authorId,
      authorName: authorRows[0]?.name ?? "",
      type: input.type,
      title: input.title,
      body: (input as { body?: string | null }).body ?? null,
      dueAt: input.type === "COUNTDOWN" ? new Date(input.dueAt) : null,
      pinned: false,
      createdAt: bulletin.created_at,
      updatedAt: bulletin.updated_at,
      totalAssignees: input.type === "COUNTDOWN" ? input.assigneeIds.length : 0,
      completedCount: 0,
      myStatus: input.type === "COUNTDOWN" && input.assigneeIds.includes(authorId)
        ? CountdownStatus.PENDING
        : null,
    };
  });
}

// ── markComplete ──────────────────────────────────────────────────────────────

export async function markComplete(userId: string, bulletinId: string): Promise<void> {
  const updated = await queryOne<{ id: string }>(
    `UPDATE countdown_assignments
     SET status = 'COMPLETED', completed_at = now()
     WHERE bulletin_id = $1 AND user_id = $2 AND status IN ('PENDING', 'OVERDUE')
     RETURNING id`,
    [bulletinId, userId]
  );
  if (!updated) throw new BulletinNotFoundError();

  emitActivityEvent({
    userId,
    eventType: "COUNTDOWN_COMPLETED",
    details: { bulletinId },
  }).catch(() => {});

  writeAuditLog(AuditAction.COUNTDOWN_COMPLETED, userId, bulletinId, {}).catch(() => {});
}

// ── deleteBulletin ────────────────────────────────────────────────────────────

export async function deleteBulletin(
  actorId: string,
  actorRole: string,
  bulletinId: string
): Promise<void> {
  const bulletin = await queryOne<{ id: string; author_id: string }>(
    `SELECT id, author_id FROM bulletins WHERE id = $1`,
    [bulletinId]
  );
  if (!bulletin) throw new BulletinNotFoundError();
  if (bulletin.author_id !== actorId && actorRole !== "ADMIN") {
    throw new ForbiddenError("Only the author or an admin can delete a bulletin.");
  }

  await query(`DELETE FROM bulletins WHERE id = $1`, [bulletinId]);
  writeAuditLog(AuditAction.BULLETIN_DELETED, actorId, bulletinId, {}).catch(() => {});
}

// ── pinBulletin ───────────────────────────────────────────────────────────────

export async function pinBulletin(
  adminId: string,
  bulletinId: string,
  pinned: boolean
): Promise<void> {
  const result = await queryOne<{ id: string }>(
    `UPDATE bulletins SET pinned = $1, updated_at = now() WHERE id = $2 RETURNING id`,
    [pinned, bulletinId]
  );
  if (!result) throw new BulletinNotFoundError();
  writeAuditLog(AuditAction.BULLETIN_PINNED, adminId, bulletinId, { pinned }).catch(() => {});
}
