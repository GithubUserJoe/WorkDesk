import { query, queryOne, transaction } from "@/lib/db";
import { AuditAction } from "@/lib/enums";
import { emitNotification } from "@/modules/notifications/services/notificationService";
import type { LibrarySectionSummary, LibraryArtifactItem } from "../types";
import type { PaginatedResult } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// Library Service
// ─────────────────────────────────────────────────────────────────────────────

export class SectionNotFoundError extends Error {
  readonly code = "SECTION_NOT_FOUND";
  constructor() { super("Library section not found."); this.name = "SectionNotFoundError"; }
}

export class ArtifactNotFoundError extends Error {
  readonly code = "ARTIFACT_NOT_FOUND";
  constructor() { super("Artifact not found or you do not own it."); this.name = "ArtifactNotFoundError"; }
}

export class AlreadyPublishedError extends Error {
  readonly code = "ALREADY_PUBLISHED";
  constructor() { super("Artifact is already in this section."); this.name = "AlreadyPublishedError"; }
}

export class NotPublishedError extends Error {
  readonly code = "NOT_PUBLISHED";
  constructor() { super("Artifact is not in this section."); this.name = "NotPublishedError"; }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(msg = "You do not have permission to perform this action.") {
    super(msg); this.name = "ForbiddenError";
  }
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function writeAuditLog(
  action: string,
  actorId: string,
  targetId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1,$2,$3,$4)`,
      [action, actorId, targetId, JSON.stringify(details)]
    );
  } catch { /* non-blocking */ }
}

// ── Raw rows ──────────────────────────────────────────────────────────────────

interface SectionRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_by_name: string;
  artifact_count: string;
  subscriber_count: string;
  is_subscribed: boolean;
  created_at: Date;
  updated_at: Date;
}

interface ArtifactRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  tags: unknown;
  owner_id: string;
  owner_name: string;
  visibility: string;
  added_by: string;
  added_by_name: string;
  added_at: Date;
  created_at: Date;
  updated_at: Date;
}

function rowToSection(r: SectionRow): LibrarySectionSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    artifactCount: Number(r.artifact_count),
    subscriberCount: Number(r.subscriber_count),
    isSubscribed: r.is_subscribed,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToArtifact(r: ArtifactRow): LibraryArtifactItem {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    visibility: r.visibility,
    addedBy: r.added_by,
    addedByName: r.added_by_name,
    addedAt: r.added_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── listSections ──────────────────────────────────────────────────────────────

export async function listSections(
  userId: string,
  roomId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PaginatedResult<LibrarySectionSummary>> {
  const limit  = Math.min(options.limit  ?? 50, 200);
  const offset = options.offset ?? 0;

  const [rows, countRows] = await Promise.all([
    query<SectionRow>(
      `SELECT ls.id, ls.name, ls.description, ls.created_by,
              u.name AS created_by_name,
              COUNT(DISTINCT la.artifact_id) AS artifact_count,
              COUNT(DISTINCT sub.user_id)    AS subscriber_count,
              EXISTS(SELECT 1 FROM library_subscriptions s2
                     WHERE s2.section_id = ls.id AND s2.user_id = $1) AS is_subscribed,
              ls.created_at, ls.updated_at
       FROM library_sections ls
       JOIN users u ON u.id = ls.created_by
       LEFT JOIN library_artifacts la ON la.section_id = ls.id
       LEFT JOIN library_subscriptions sub ON sub.section_id = ls.id
       WHERE ls.room_id = $4
       GROUP BY ls.id, u.name
       ORDER BY ls.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset, roomId]
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM library_sections WHERE room_id = $1`,
      [roomId]
    ),
  ]);

  const total = parseInt(countRows[0]?.total ?? "0", 10);
  const items = rows.map(rowToSection);
  return { items, total, hasMore: offset + items.length < total, limit, offset };
}

// ── createSection ─────────────────────────────────────────────────────────────

export async function createSection(
  userId: string,
  roomId: string,
  name: string,
  description: string | null
): Promise<LibrarySectionSummary> {
  const rows = await query<SectionRow>(
    `WITH ins AS (
       INSERT INTO library_sections (name, description, created_by, room_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT ins.id, ins.name, ins.description, ins.created_by,
            u.name AS created_by_name,
            0::bigint AS artifact_count,
            0::bigint AS subscriber_count,
            false AS is_subscribed,
            ins.created_at, ins.updated_at
     FROM ins JOIN users u ON u.id = ins.created_by`,
    [name, description, userId, roomId]
  );
  writeAuditLog("LIBRARY_SECTION_CREATED" as string, userId, rows[0].id, { name }).catch(() => {});
  return rowToSection(rows[0]);
}

// ── deleteSection ─────────────────────────────────────────────────────────────

export async function deleteSection(
  userId: string,
  userRole: string,
  sectionId: string
): Promise<void> {
  const section = await queryOne<{ id: string; created_by: string; name: string }>(
    `SELECT id, created_by, name FROM library_sections WHERE id = $1`,
    [sectionId]
  );
  if (!section) throw new SectionNotFoundError();
  if (section.created_by !== userId && userRole !== "ADMIN")
    throw new ForbiddenError("Only the section creator or an admin can delete it.");

  await query(`DELETE FROM library_sections WHERE id = $1`, [sectionId]);
  writeAuditLog(AuditAction.LIBRARY_SECTION_DELETED, userId, sectionId, { name: section.name }).catch(() => {});
}

// ── getSectionArtifacts ───────────────────────────────────────────────────────

export async function getSectionArtifacts(
  sectionId: string
): Promise<LibraryArtifactItem[]> {
  const exists = await queryOne<{ id: string }>(
    `SELECT id FROM library_sections WHERE id = $1`, [sectionId]
  );
  if (!exists) throw new SectionNotFoundError();

  const rows = await query<ArtifactRow>(
    `SELECT a.id, a.title, a.description, a.type, a.tags,
            a.owner_id, ou.name AS owner_name, a.visibility,
            la.added_by, au.name AS added_by_name, la.added_at,
            a.created_at, a.updated_at
     FROM library_artifacts la
     JOIN artifacts a ON a.id = la.artifact_id
     JOIN users ou    ON ou.id = a.owner_id
     JOIN users au    ON au.id = la.added_by
     WHERE la.section_id = $1
       AND a.deleted_at IS NULL
     ORDER BY la.added_at DESC`,
    [sectionId]
  );
  return rows.map(rowToArtifact);
}

// ── publishArtifact ───────────────────────────────────────────────────────────

export async function publishArtifact(
  ownerId: string,
  artifactId: string,
  sectionId: string
): Promise<void> {
  const artifact = await queryOne<{ id: string; title: string }>(
    `SELECT id, title FROM artifacts WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [artifactId, ownerId]
  );
  if (!artifact) throw new ArtifactNotFoundError();

  const section = await queryOne<{ id: string }>(
    `SELECT id FROM library_sections WHERE id = $1`, [sectionId]
  );
  if (!section) throw new SectionNotFoundError();

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM library_artifacts WHERE section_id = $1 AND artifact_id = $2`,
    [sectionId, artifactId]
  );
  if (existing) throw new AlreadyPublishedError();

  await transaction(async (tx) => {
    await tx.query(
      `UPDATE artifacts SET visibility = 'PUBLIC', updated_at = now() WHERE id = $1`,
      [artifactId]
    );
    await tx.query(
      `INSERT INTO library_artifacts (section_id, artifact_id, added_by) VALUES ($1,$2,$3)`,
      [sectionId, artifactId, ownerId]
    );
    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1,$2,$3,$4)`,
      [
        AuditAction.ARTIFACT_VISIBILITY_CHANGED,
        ownerId,
        artifactId,
        JSON.stringify({ visibility: "PUBLIC", sectionId, title: artifact.title }),
      ]
    );
  });

  // Notify the owner (self-publish confirmation) and subscribers (best-effort).
  emitNotification(
    ownerId,
    "ARTIFACT_PUBLISHED",
    "Artifact published to Library",
    `"${artifact.title}" is now public in the Library.`,
    { artifactId, artifactTitle: artifact.title, sectionId }
  ).catch(() => {});
}

// ── unpublishArtifact ─────────────────────────────────────────────────────────

export async function unpublishArtifact(
  ownerId: string,
  artifactId: string,
  sectionId: string
): Promise<void> {
  const artifact = await queryOne<{ id: string; title: string }>(
    `SELECT id, title FROM artifacts WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [artifactId, ownerId]
  );
  if (!artifact) throw new ArtifactNotFoundError();

  const deleted = await queryOne<{ id: string }>(
    `DELETE FROM library_artifacts WHERE section_id = $1 AND artifact_id = $2 RETURNING id`,
    [sectionId, artifactId]
  );
  if (!deleted) throw new NotPublishedError();

  // Revert to PRIVATE if no remaining section memberships.
  const remaining = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM library_artifacts WHERE artifact_id = $1`,
    [artifactId]
  );
  if (Number(remaining?.count ?? 0) === 0) {
    await query(
      `UPDATE artifacts SET visibility = 'PRIVATE', updated_at = now()
       WHERE id = $1 AND visibility = 'PUBLIC'`,
      [artifactId]
    );
  }

  writeAuditLog(AuditAction.ARTIFACT_VISIBILITY_CHANGED, ownerId, artifactId, {
    visibility: "PRIVATE",
    sectionId,
    title: artifact.title,
  }).catch(() => {});
}

// ── subscribeSection / unsubscribeSection ─────────────────────────────────────

export async function subscribeSection(userId: string, sectionId: string): Promise<void> {
  const section = await queryOne<{ id: string }>(
    `SELECT id FROM library_sections WHERE id = $1`, [sectionId]
  );
  if (!section) throw new SectionNotFoundError();
  await query(
    `INSERT INTO library_subscriptions (user_id, section_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [userId, sectionId]
  );
}

export async function unsubscribeSection(userId: string, sectionId: string): Promise<void> {
  await query(
    `DELETE FROM library_subscriptions WHERE user_id = $1 AND section_id = $2`,
    [userId, sectionId]
  );
}

// ── getSubscriptions ──────────────────────────────────────────────────────────

export async function getSubscriptions(userId: string): Promise<LibrarySectionSummary[]> {
  const rows = await query<SectionRow>(
    `SELECT ls.id, ls.name, ls.description, ls.created_by,
            u.name AS created_by_name,
            COUNT(DISTINCT la.artifact_id) AS artifact_count,
            COUNT(DISTINCT sub.user_id)    AS subscriber_count,
            true AS is_subscribed,
            ls.created_at, ls.updated_at
     FROM library_subscriptions my_sub
     JOIN library_sections ls ON ls.id = my_sub.section_id
     JOIN users u ON u.id = ls.created_by
     LEFT JOIN library_artifacts la ON la.section_id = ls.id
     LEFT JOIN library_subscriptions sub ON sub.section_id = ls.id
     WHERE my_sub.user_id = $1
     GROUP BY ls.id, u.name
     ORDER BY ls.created_at DESC`,
    [userId]
  );
  return rows.map(rowToSection);
}

// ── getArtifactSections ───────────────────────────────────────────────────────
// Which sections contain a given artifact (for the workspace publish panel).

export async function getArtifactSections(artifactId: string): Promise<{ id: string; name: string }[]> {
  return query<{ id: string; name: string }>(
    `SELECT ls.id, ls.name
     FROM library_artifacts la
     JOIN library_sections ls ON ls.id = la.section_id
     WHERE la.artifact_id = $1
     ORDER BY ls.name`,
    [artifactId]
  );
}

// ── publishSetToLibrary ───────────────────────────────────────────────────────
// Creates a library section named after the set, then publishes all artifacts
// in that set (and any sub-sets) into the new section.

export async function publishSetToLibrary(
  ownerId: string,
  roomId: string,
  setId: string
): Promise<{ sectionId: string; publishedCount: number }> {
  // Verify the set exists and is owned by the caller.
  const set = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM sets WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [setId, ownerId]
  );
  if (!set) throw new ArtifactNotFoundError();

  // Collect all artifact IDs in the set and its descendants.
  const artifactRows = await query<{ id: string; title: string }>(
    `WITH RECURSIVE set_tree AS (
       SELECT id FROM sets WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT s.id FROM sets s JOIN set_tree p ON s.parent_id = p.id WHERE s.deleted_at IS NULL
     )
     SELECT a.id, a.title FROM artifacts a
     JOIN set_tree st ON st.id = a.set_id
     WHERE a.deleted_at IS NULL AND a.owner_id = $2`,
    [setId, ownerId]
  );

  // Create the section named after the set, then publish each artifact.
  const sectionId = await transaction(async (tx) => {
    const { rows: secRows } = await tx.query<{ id: string }>(
      `INSERT INTO library_sections (name, description, created_by, room_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [set.name, `Published from folder "${set.name}"`, ownerId, roomId]
    );
    const sid = secRows[0].id;

    for (const a of artifactRows) {
      // Set PUBLIC + add to library_artifacts (skip if already there).
      await tx.query(
        `UPDATE artifacts SET visibility = 'PUBLIC', updated_at = now() WHERE id = $1`,
        [a.id]
      );
      await tx.query(
        `INSERT INTO library_artifacts (section_id, artifact_id, added_by)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [sid, a.id, ownerId]
      );
    }

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1,$2,$3,$4)`,
      [
        AuditAction.ARTIFACT_VISIBILITY_CHANGED as string,
        ownerId,
        sid,
        JSON.stringify({ setId, setName: set.name, count: artifactRows.length }),
      ]
    );

    return sid;
  });

  return { sectionId, publishedCount: artifactRows.length };
}
