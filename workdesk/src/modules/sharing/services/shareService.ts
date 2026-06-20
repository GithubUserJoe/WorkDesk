import { query, queryOne, transaction } from "@/lib/db";
import { AuditAction, Visibility } from "@/lib/enums";
import { emitActivityEvent } from "@/modules/activity/services/activityService";
import { emitNotification } from "@/modules/notifications/services/notificationService";
import type { ShareGrant, SharedArtifactSummary, OutgoingShare } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Sharing Service
//
// Implements the reference-based sharing model:
//   - An artifact_shares row grants one user (grantee) read access to one artifact.
//   - The artifact's visibility must be SHARED or PUBLIC for grants to be active;
//     PRIVATE disables all grants at the read-path level.
//   - Files are never duplicated. Sharing = pointer only.
// ─────────────────────────────────────────────────────────────────────────────

// ── Typed errors ─────────────────────────────────────────────────────────────

export class ArtifactNotFoundOrPrivateError extends Error {
  readonly code = "ARTIFACT_NOT_FOUND";
  constructor() {
    super("Artifact not found or you do not own it.");
    this.name = "ArtifactNotFoundOrPrivateError";
  }
}

export class GranteeNotFoundError extends Error {
  readonly code = "GRANTEE_NOT_FOUND";
  constructor() {
    super("No user found with that email address.");
    this.name = "GranteeNotFoundError";
  }
}

export class CannotShareWithSelfError extends Error {
  readonly code = "CANNOT_SHARE_WITH_SELF";
  constructor() {
    super("You cannot share an artifact with yourself.");
    this.name = "CannotShareWithSelfError";
  }
}

export class AlreadySharedError extends Error {
  readonly code = "ALREADY_SHARED";
  constructor() {
    super("This artifact is already shared with that user.");
    this.name = "AlreadySharedError";
  }
}

export class ShareNotFoundError extends Error {
  readonly code = "SHARE_NOT_FOUND";
  constructor() {
    super("Share grant not found.");
    this.name = "ShareNotFoundError";
  }
}

// ── Raw row shapes ────────────────────────────────────────────────────────────

interface ShareRow {
  id: string;
  artifact_id: string;
  owner_id: string;
  grantee_id: string;
  grantee_name: string;
  grantee_email: string;
  created_at: Date;
}

// ── writeAuditLog (non-throwing) ──────────────────────────────────────────────

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

// ── shareArtifact ─────────────────────────────────────────────────────────────

/**
 * Grant read access to an artifact for a specific user (by email).
 * Sets visibility=SHARED on the artifact if it's still PRIVATE.
 */
export async function shareArtifact(
  ownerId: string,
  artifactId: string,
  granteeEmail: string
): Promise<ShareGrant> {
  // Verify ownership (owner must own the artifact and it must be live).
  const artifact = await queryOne<{ id: string; visibility: string; title: string }>(
    `SELECT id, visibility, title FROM artifacts
     WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [artifactId, ownerId]
  );
  if (!artifact) throw new ArtifactNotFoundOrPrivateError();

  // Resolve grantee.
  const grantee = await queryOne<{ id: string; name: string; email: string }>(
    `SELECT id, name, email FROM users WHERE email = $1 AND status = 'ACTIVE'`,
    [granteeEmail]
  );
  if (!grantee) throw new GranteeNotFoundError();
  if (grantee.id === ownerId) throw new CannotShareWithSelfError();

  // Check for existing grant.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM artifact_shares WHERE artifact_id = $1 AND grantee_id = $2`,
    [artifactId, grantee.id]
  );
  if (existing) throw new AlreadySharedError();

  return transaction(async (tx) => {
    // Promote to SHARED visibility if still PRIVATE.
    if (artifact.visibility === Visibility.PRIVATE) {
      await tx.query(
        `UPDATE artifacts SET visibility = 'SHARED', updated_at = now() WHERE id = $1`,
        [artifactId]
      );
    }

    const { rows } = await tx.query<{ id: string; created_at: Date }>(
      `INSERT INTO artifact_shares (artifact_id, owner_id, grantee_id)
       VALUES ($1, $2, $3) RETURNING id, created_at`,
      [artifactId, ownerId, grantee.id]
    );
    const row = rows[0];

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        AuditAction.ARTIFACT_SHARED,
        ownerId,
        artifactId,
        JSON.stringify({ granteeId: grantee.id, granteeEmail: grantee.email, artifactTitle: artifact.title }),
      ]
    );

    emitActivityEvent({
      userId: ownerId,
      eventType: "ARTIFACT_SHARED",
      artifactId,
      details: { granteeEmail: grantee.email, granteeName: grantee.name },
    }).catch(() => {});

    // Notify the grantee (best-effort — never blocks the share).
    emitNotification(
      grantee.id,
      "ARTIFACT_SHARED",
      "Artifact shared with you",
      `"${artifact.title}" was shared with you.`,
      { artifactId, artifactTitle: artifact.title }
    ).catch(() => {});

    return {
      id: row.id,
      artifactId,
      ownerId,
      granteeId: grantee.id,
      granteeName: grantee.name,
      granteeEmail: grantee.email,
      createdAt: row.created_at,
    };
  });
}

// ── revokeShare ───────────────────────────────────────────────────────────────

/**
 * Remove a share grant. If no grants remain and visibility is SHARED, revert to PRIVATE.
 */
export async function revokeShare(
  ownerId: string,
  artifactId: string,
  granteeId: string
): Promise<void> {
  const artifact = await queryOne<{ id: string; title: string }>(
    `SELECT id, title FROM artifacts WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [artifactId, ownerId]
  );
  if (!artifact) throw new ArtifactNotFoundOrPrivateError();

  const deleted = await queryOne<{ id: string }>(
    `DELETE FROM artifact_shares
     WHERE artifact_id = $1 AND grantee_id = $2 AND owner_id = $3
     RETURNING id`,
    [artifactId, granteeId, ownerId]
  );
  if (!deleted) throw new ShareNotFoundError();

  // If no remaining grants, revert visibility to PRIVATE.
  const remaining = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM artifact_shares WHERE artifact_id = $1`,
    [artifactId]
  );
  if (Number(remaining?.count ?? 0) === 0) {
    await query(
      `UPDATE artifacts SET visibility = 'PRIVATE', updated_at = now()
       WHERE id = $1 AND visibility = 'SHARED'`,
      [artifactId]
    );
  }

  writeAuditLog(AuditAction.ARTIFACT_SHARE_REVOKED, ownerId, artifactId, {
    granteeId,
    artifactTitle: artifact.title,
  }).catch(() => {});

  emitActivityEvent({
    userId: ownerId,
    eventType: "ARTIFACT_SHARE_REVOKED",
    artifactId,
    details: { granteeId },
  }).catch(() => {});
}

// ── listShareGrants ───────────────────────────────────────────────────────────

/** All share grants on one artifact (owner view — who has access). */
export async function listShareGrants(
  ownerId: string,
  artifactId: string
): Promise<ShareGrant[]> {
  const rows = await query<ShareRow>(
    `SELECT s.id, s.artifact_id, s.owner_id, s.grantee_id,
            u.name AS grantee_name, u.email AS grantee_email, s.created_at
     FROM artifact_shares s
     JOIN users u ON u.id = s.grantee_id
     WHERE s.artifact_id = $1 AND s.owner_id = $2
     ORDER BY s.created_at DESC`,
    [artifactId, ownerId]
  );
  return rows.map((r) => ({
    id: r.id,
    artifactId: r.artifact_id,
    ownerId: r.owner_id,
    granteeId: r.grantee_id,
    granteeName: r.grantee_name,
    granteeEmail: r.grantee_email,
    createdAt: r.created_at,
  }));
}

// ── shareSet ──────────────────────────────────────────────────────────────────

/**
 * Share all artifacts within a set (and its sub-sets) with a user by email.
 * Returns the count of artifacts newly shared.
 */
export async function shareSet(
  ownerId: string,
  setId: string,
  granteeEmail: string
): Promise<{ sharedCount: number }> {
  // Verify the set exists and is owned by the caller.
  const set = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM sets WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
    [setId, ownerId]
  );
  if (!set) throw new ArtifactNotFoundOrPrivateError();

  // Resolve grantee.
  const grantee = await queryOne<{ id: string; name: string; email: string }>(
    `SELECT id, name, email FROM users WHERE email = $1 AND status = 'ACTIVE'`,
    [granteeEmail]
  );
  if (!grantee) throw new GranteeNotFoundError();
  if (grantee.id === ownerId) throw new CannotShareWithSelfError();

  // Collect all artifacts in the set and its descendants owned by the caller.
  const artifactRows = await query<{ id: string; title: string; visibility: string }>(
    `WITH RECURSIVE set_tree AS (
       SELECT id FROM sets WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT s.id FROM sets s JOIN set_tree p ON s.parent_id = p.id WHERE s.deleted_at IS NULL
     )
     SELECT a.id, a.title, a.visibility FROM artifacts a
     JOIN set_tree st ON st.id = a.set_id
     WHERE a.deleted_at IS NULL AND a.owner_id = $2`,
    [setId, ownerId]
  );

  let sharedCount = 0;

  for (const artifact of artifactRows) {
    // Skip if already shared with this user.
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM artifact_shares WHERE artifact_id = $1 AND grantee_id = $2`,
      [artifact.id, grantee.id]
    );
    if (existing) continue;

    await transaction(async (tx) => {
      if (artifact.visibility === "PRIVATE") {
        await tx.query(
          `UPDATE artifacts SET visibility = 'SHARED', updated_at = now() WHERE id = $1`,
          [artifact.id]
        );
      }
      await tx.query(
        `INSERT INTO artifact_shares (artifact_id, owner_id, grantee_id)
         VALUES ($1, $2, $3)`,
        [artifact.id, ownerId, grantee.id]
      );
    });
    sharedCount++;
  }

  if (sharedCount > 0) {
    emitNotification(
      grantee.id,
      "ARTIFACT_SHARED",
      "Folder shared with you",
      `"${set.name}" (${sharedCount} item${sharedCount !== 1 ? "s" : ""}) was shared with you.`,
      { setId, setName: set.name }
    ).catch(() => {});

    writeAuditLog(AuditAction.ARTIFACT_SHARED, ownerId, setId, {
      setName: set.name, granteeId: grantee.id, granteeEmail, sharedCount,
    }).catch(() => {});
  }

  return { sharedCount };
}

// ── listMyShares ──────────────────────────────────────────────────────────────

/** All artifacts the current user has shared with others (outgoing shares). */
export async function listMyShares(ownerId: string): Promise<OutgoingShare[]> {
  const rows = await query<{
    share_id: string;
    artifact_id: string;
    artifact_title: string;
    artifact_type: string;
    grantee_id: string;
    grantee_name: string;
    grantee_email: string;
    shared_at: Date;
  }>(
    `SELECT s.id AS share_id, a.id AS artifact_id, a.title AS artifact_title,
            a.type AS artifact_type,
            g.id AS grantee_id, g.name AS grantee_name, g.email AS grantee_email,
            s.created_at AS shared_at
     FROM artifact_shares s
     JOIN artifacts a ON a.id = s.artifact_id
     JOIN users g     ON g.id = s.grantee_id
     WHERE s.owner_id = $1 AND a.deleted_at IS NULL
     ORDER BY s.created_at DESC`,
    [ownerId]
  );

  return rows.map((r) => ({
    shareId: r.share_id,
    artifactId: r.artifact_id,
    artifactTitle: r.artifact_title,
    artifactType: r.artifact_type,
    granteeId: r.grantee_id,
    granteeName: r.grantee_name,
    granteeEmail: r.grantee_email,
    sharedAt: r.shared_at,
  }));
}

// ── listSharedWithMe ──────────────────────────────────────────────────────────

/** Artifacts shared with `userId` by others. */
export async function listSharedWithMe(userId: string): Promise<SharedArtifactSummary[]> {
  const rows = await query<{
    id: string;
    title: string;
    description: string | null;
    tags: unknown;
    type: string;
    owner_id: string;
    owner_name: string;
    set_id: string | null;
    created_at: Date;
    updated_at: Date;
    shared_at: Date;
  }>(
    `SELECT a.id, a.title, a.description, a.tags, a.type,
            a.owner_id, u.name AS owner_name, a.set_id,
            a.created_at, a.updated_at, s.created_at AS shared_at
     FROM artifact_shares s
     JOIN artifacts a ON a.id = s.artifact_id
     JOIN users u     ON u.id = a.owner_id
     WHERE s.grantee_id = $1
       AND a.deleted_at IS NULL
       AND a.visibility IN ('SHARED', 'PUBLIC')
     ORDER BY s.created_at DESC`,
    [userId]
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    type: r.type,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    setId: r.set_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sharedAt: r.shared_at,
  }));
}

// ── canReadSharedArtifact ─────────────────────────────────────────────────────

/**
 * Returns true if userId has a share grant on artifactId AND the artifact
 * is not PRIVATE. Used by the content/versions routes to extend read access.
 */
export async function canReadSharedArtifact(
  userId: string,
  artifactId: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT s.id FROM artifact_shares s
     JOIN artifacts a ON a.id = s.artifact_id
     WHERE s.artifact_id = $1
       AND s.grantee_id = $2
       AND a.deleted_at IS NULL
       AND a.visibility IN ('SHARED', 'PUBLIC')`,
    [artifactId, userId]
  );
  return Boolean(row);
}
