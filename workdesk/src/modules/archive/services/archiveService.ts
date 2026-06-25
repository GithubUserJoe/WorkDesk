import { query, queryOne, transaction } from "@/lib/db";
import { AuditAction, ArtifactType, Visibility } from "@/lib/enums";
import { incrementStorageUsed } from "./storageService";
import { emitActivityEvent } from "@/modules/activity/services/activityService";
import type { PaginatedResult } from "@/types/common";
import {
  SetSummary,
  SetDetail,
  ArtifactSummary,
  ArtifactDetail,
  VersionDetail,
  CreateSetPayload,
  UpdateSetPayload,
  CreateArtifactPayload,
  UpdateArtifactPayload,
  CommitVersionPayload,
} from "../types";
import { assertContentKeyNamespace, extractUserId, InvalidContentKeyError } from "../utils/contentKey";

export { InvalidContentKeyError };

// ─────────────────────────────────────────────────────────────────────────────
// Raw row shapes (snake_case columns from PostgreSQL).
// ─────────────────────────────────────────────────────────────────────────────

interface SetRow {
  id: string;
  name: string;
  parent_id: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface ArtifactRow {
  id: string;
  title: string;
  description: string | null;
  tags: unknown; // jsonb → already parsed by pg
  type: ArtifactType;
  visibility: Visibility;
  owner_id: string;
  set_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface VersionRow {
  id: string;
  artifact_id: string;
  version_number: number;
  content_key: string;
  byte_size: string | null; // bigint → string from pg
  change_summary: string | null;
  author_id: string;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed Archive Errors
// ─────────────────────────────────────────────────────────────────────────────

export class SetNotFoundError extends Error {
  readonly code = "SET_NOT_FOUND";
  constructor() {
    super("Folder not found.");
    this.name = "SetNotFoundError";
  }
}

export class ArtifactNotFoundError extends Error {
  readonly code = "ARTIFACT_NOT_FOUND";
  constructor() {
    super("Artifact not found.");
    this.name = "ArtifactNotFoundError";
  }
}

export class VersionNotFoundError extends Error {
  readonly code = "VERSION_NOT_FOUND";
  constructor() {
    super("Version snapshot not found.");
    this.name = "VersionNotFoundError";
  }
}

export class CircularReferenceError extends Error {
  readonly code = "CIRCULAR_REFERENCE";
  constructor(message = "A folder cannot be moved into its own subfolders.") {
    super(message);
    this.name = "CircularReferenceError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → DTO mappers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTags(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function toSetSummary(row: SetRow): SetSummary {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toArtifactSummary(row: ArtifactRow): ArtifactSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: normalizeTags(row.tags),
    type: row.type,
    visibility: row.visibility,
    ownerId: row.owner_id,
    setId: row.set_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVersionDetail(row: VersionRow): VersionDetail {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    versionNumber: row.version_number,
    contentKey: row.content_key,
    changeSummary: row.change_summary,
    authorId: row.author_id,
    createdAt: row.created_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Content Key Reference Validation (R2 pointer ownership)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures a content key is accessible to the caller: either they own the artifact
 * it belongs to, or they have an active share grant on it (V2 shared read path).
 */
export async function verifyContentKeyReference(userId: string, contentKey: string): Promise<void> {
  // Owner path: key must be in caller's namespace and linked to their artifact.
  const keyOwnerId = extractUserId(contentKey);

  if (keyOwnerId === userId) {
    // Fast path — owner check only.
    assertContentKeyNamespace(userId, contentKey);
    const version = await queryOne<{ id: string }>(
      `SELECT v.id FROM versions v
       JOIN artifacts a ON a.id = v.artifact_id
       WHERE v.content_key = $1 AND a.owner_id = $2 AND a.deleted_at IS NULL
       LIMIT 1`,
      [contentKey, userId]
    );
    if (!version) throw new InvalidContentKeyError("Content key is not linked to any of your artifacts.");
    return;
  }

  // Shared-read path: key belongs to another user — share grant or PUBLIC visibility.
  const granted = await queryOne<{ id: string }>(
    `SELECT v.id FROM versions v
     JOIN artifacts a ON a.id = v.artifact_id
     LEFT JOIN artifact_shares s ON s.artifact_id = a.id AND s.grantee_id = $2
     WHERE v.content_key = $1
       AND a.deleted_at IS NULL
       AND (
         a.visibility = 'PUBLIC'
         OR (a.visibility IN ('SHARED', 'PUBLIC') AND s.id IS NOT NULL)
       )
     LIMIT 1`,
    [contentKey, userId]
  );
  if (!granted) throw new InvalidContentKeyError("Content key is not linked to any of your artifacts.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Audit Logger Helper (non-throwing)
// ─────────────────────────────────────────────────────────────────────────────

async function writeAuditLog(
  action: AuditAction,
  actorId: string,
  targetId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [action, actorId, targetId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error("[AuditLog] Failed to write audit record:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Set (Directory Folder) Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function createSet(ownerId: string, roomId: string, payload: CreateSetPayload): Promise<SetSummary> {
  if (payload.parentId) {
    const parent = await queryOne<{ id: string }>(
      `SELECT id FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
      [payload.parentId, ownerId, roomId]
    );
    if (!parent) {
      throw new SetNotFoundError();
    }
  }

  const set = await queryOne<SetRow>(
    `INSERT INTO sets (name, parent_id, owner_id, room_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [payload.name, payload.parentId ?? null, ownerId, roomId]
  );

  await writeAuditLog("SET_CREATED", ownerId, set!.id, { name: set!.name });
  emitActivityEvent({ userId: ownerId, eventType: "SET_CREATED", setId: set!.id, details: { name: set!.name } }).catch(() => {});

  return toSetSummary(set!);
}

export async function updateSet(
  ownerId: string,
  roomId: string,
  setId: string,
  payload: UpdateSetPayload
): Promise<SetSummary> {
  const existing = await queryOne<SetRow>(
    `SELECT id, name, parent_id, owner_id, created_at, updated_at, deleted_at
     FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [setId, ownerId, roomId]
  );
  if (!existing) {
    throw new SetNotFoundError();
  }

  // Handle circular reference checks when moving folders.
  if (payload.parentId !== undefined && payload.parentId !== existing.parent_id) {
    if (payload.parentId === setId) {
      throw new CircularReferenceError("A folder cannot be its own parent.");
    }

    if (payload.parentId !== null) {
      // Confirm target parent exists.
      const targetParent = await queryOne<SetRow>(
        `SELECT id, name, parent_id, owner_id, created_at, updated_at, deleted_at
         FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
        [payload.parentId, ownerId, roomId]
      );
      if (!targetParent) {
        throw new SetNotFoundError();
      }

      // Fetch the target parent's full ancestry in one recursive CTE.
      // If setId appears anywhere in the ancestor chain the move would create a cycle.
      const ancestorResult = await queryOne<{ ancestor_ids: string[] }>(
        `WITH RECURSIVE ancestors AS (
           SELECT id, parent_id FROM sets
             WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
           UNION ALL
           SELECT s.id, s.parent_id FROM sets s
             JOIN ancestors a ON s.id = a.parent_id
             WHERE s.deleted_at IS NULL
         )
         SELECT COALESCE(ARRAY_AGG(id), '{}') AS ancestor_ids FROM ancestors`,
        [targetParent.id, ownerId]
      );
      if (ancestorResult?.ancestor_ids.includes(setId)) {
        throw new CircularReferenceError();
      }
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (payload.name !== undefined) {
    sets.push(`name = $${i++}`);
    params.push(payload.name);
  }
  if (payload.parentId !== undefined) {
    sets.push(`parent_id = $${i++}`);
    params.push(payload.parentId);
  }
  sets.push(`updated_at = now()`);
  params.push(setId);

  const updated = await queryOne<SetRow>(
    `UPDATE sets SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );

  await writeAuditLog("SET_UPDATED", ownerId, setId, {
    before: { name: existing.name, parentId: existing.parent_id },
    after: { name: updated!.name, parentId: updated!.parent_id },
  });
  emitActivityEvent({ userId: ownerId, eventType: "SET_UPDATED", setId, details: { name: updated!.name } }).catch(() => {});

  return toSetSummary(updated!);
}

/**
 * softDeleteSet
 *
 * Performs cascading soft-delete of a folder. Updates deleted_at on the folder,
 * all its descendants (subfolders), and all artifacts contained inside them.
 */
export async function softDeleteSet(ownerId: string, roomId: string, setId: string): Promise<void> {
  const target = await queryOne<SetRow>(
    `SELECT id, name, parent_id, owner_id, created_at, updated_at, deleted_at
     FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [setId, ownerId, roomId]
  );
  if (!target) {
    throw new SetNotFoundError();
  }

  // Recursive helper to collect all live descendant subfolder IDs.
  async function getDescendantSetIds(parentIds: string[]): Promise<string[]> {
    const children = await query<{ id: string }>(
      `SELECT id FROM sets WHERE parent_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [parentIds]
    );
    const childIds = children.map((c) => c.id);
    if (childIds.length === 0) return [];
    return [...childIds, ...(await getDescendantSetIds(childIds))];
  }

  const descendantIds = await getDescendantSetIds([setId]);
  const allSetIds = [setId, ...descendantIds];

  await transaction(async (tx) => {
    await tx.query(
      `UPDATE sets SET deleted_at = now() WHERE id = ANY($1::uuid[])`,
      [allSetIds]
    );

    await tx.query(
      `UPDATE artifacts SET deleted_at = now()
       WHERE set_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [allSetIds]
    );

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        "SET_DELETED",
        ownerId,
        setId,
        JSON.stringify({
          deletedSetCount: allSetIds.length,
          cascadeDeletedSetIds: descendantIds,
        }),
      ]
    );
  });

  emitActivityEvent({ userId: ownerId, eventType: "SET_DELETED", setId, details: { name: target.name } }).catch(() => {});
}

export async function getSets(
  ownerId: string,
  roomId: string,
  parentId: string | null | "root",
  options: { limit?: number; offset?: number } = {}
): Promise<PaginatedResult<SetSummary>> {
  const parentFilter = parentId === "root" ? null : parentId;
  const limit  = Math.min(options.limit  ?? 200, 500);
  const offset = options.offset ?? 0;

  if (parentFilter !== null) {
    const parent = await queryOne<{ id: string }>(
      `SELECT id FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
      [parentFilter, ownerId, roomId]
    );
    if (!parent) {
      throw new SetNotFoundError();
    }
  }

  const [rows, countRows] = await Promise.all([
    query<SetRow>(
      `SELECT id, name, parent_id, owner_id, created_at, updated_at, deleted_at
       FROM sets
       WHERE owner_id = $1 AND room_id = $2 AND deleted_at IS NULL
         AND parent_id IS NOT DISTINCT FROM $3
       ORDER BY name ASC
       LIMIT $4 OFFSET $5`,
      [ownerId, roomId, parentFilter, limit, offset]
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM sets
       WHERE owner_id = $1 AND room_id = $2 AND deleted_at IS NULL
         AND parent_id IS NOT DISTINCT FROM $3`,
      [ownerId, roomId, parentFilter]
    ),
  ]);

  const total = parseInt(countRows[0]?.total ?? "0", 10);
  return {
    items:   rows.map(toSetSummary),
    total,
    hasMore: offset + rows.length < total,
    limit,
    offset,
  };
}

/**
 * getSetDetail
 *
 * Returns a folder with its immediate child sets and artifacts.
 * Does not recurse into nested subfolders (use parentId queries to navigate).
 */
export async function getSetDetail(ownerId: string, roomId: string, setId: string): Promise<SetDetail> {
  const set = await queryOne<SetRow>(
    `SELECT id, name, parent_id, owner_id, created_at, updated_at, deleted_at
     FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [setId, ownerId, roomId]
  );
  if (!set) {
    throw new SetNotFoundError();
  }

  const [children, artifacts] = await Promise.all([
    query<SetRow>(
      `SELECT id, name, parent_id, owner_id, created_at, updated_at, deleted_at
       FROM sets
       WHERE parent_id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL
       ORDER BY name ASC`,
      [setId, ownerId, roomId]
    ),
    query<ArtifactRow>(
      `SELECT id, title, description, tags, type, visibility, owner_id, set_id,
              created_at, updated_at, deleted_at
       FROM artifacts
       WHERE set_id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
      [setId, ownerId, roomId]
    ),
  ]);

  return {
    ...toSetSummary(set),
    children: children.map(toSetSummary),
    artifacts: artifacts.map(toArtifactSummary),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function createArtifact(
  ownerId: string,
  roomId: string,
  payload: CreateArtifactPayload
): Promise<ArtifactDetail> {
  if (payload.setId) {
    const parentSet = await queryOne<{ id: string }>(
      `SELECT id FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
      [payload.setId, ownerId, roomId]
    );
    if (!parentSet) {
      throw new SetNotFoundError();
    }
  }

  const tags = payload.tags ?? [];

  if (payload.initialFileKey) {
    assertContentKeyNamespace(ownerId, payload.initialFileKey);
  }

  return transaction(async (tx) => {
    const { rows: artifactRows } = await tx.query<ArtifactRow>(
      `INSERT INTO artifacts (title, description, tags, type, visibility, owner_id, set_id, room_id)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        payload.title,
        payload.description ?? null,
        JSON.stringify(tags),
        payload.type,
        payload.visibility ?? Visibility.PRIVATE,
        ownerId,
        payload.setId ?? null,
        roomId,
      ]
    );
    const artifact = artifactRows[0];

    let version: VersionRow | null = null;
    if (payload.initialFileKey) {
      const { rows: versionRows } = await tx.query<VersionRow>(
        `INSERT INTO versions (artifact_id, version_number, content_key, change_summary, author_id)
         VALUES ($1, 1, $2, $3, $4)
         RETURNING *`,
        [
          artifact.id,
          payload.initialFileKey,
          payload.changeSummary ?? "Initial version upload.",
          ownerId,
        ]
      );
      version = versionRows[0];
    }

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        "ARTIFACT_CREATED",
        ownerId,
        artifact.id,
        JSON.stringify({
          title: artifact.title,
          type: artifact.type,
          hasInitialVersion: Boolean(payload.initialFileKey),
        }),
      ]
    );

    return {
      ...toArtifactSummary(artifact),
      versions: version ? [toVersionDetail(version)] : [],
    };
  }).then((result) => {
    emitActivityEvent({ userId: ownerId, eventType: "ARTIFACT_CREATED", artifactId: result.id, details: { title: result.title, type: result.type } }).catch(() => {});
    return result;
  });
}

export async function updateArtifact(
  ownerId: string,
  roomId: string,
  artifactId: string,
  payload: UpdateArtifactPayload
): Promise<ArtifactSummary> {
  const existing = await queryOne<ArtifactRow>(
    `SELECT id, title, description, tags, type, visibility, owner_id, set_id,
            created_at, updated_at, deleted_at
     FROM artifacts WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [artifactId, ownerId, roomId]
  );
  if (!existing) {
    throw new ArtifactNotFoundError();
  }

  if (payload.setId !== undefined && payload.setId !== null) {
    const parentSet = await queryOne<{ id: string }>(
      `SELECT id FROM sets WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
      [payload.setId, ownerId, roomId]
    );
    if (!parentSet) {
      throw new SetNotFoundError();
    }
  }

  const tags = payload.tags ?? normalizeTags(existing.tags);

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (payload.title !== undefined) {
    sets.push(`title = $${i++}`);
    params.push(payload.title);
  }
  if (payload.description !== undefined) {
    sets.push(`description = $${i++}`);
    params.push(payload.description);
  }
  // tags are always written (replace-whole semantics, matching prior behavior).
  sets.push(`tags = $${i++}::jsonb`);
  params.push(JSON.stringify(tags));
  if (payload.visibility !== undefined) {
    sets.push(`visibility = $${i++}`);
    params.push(payload.visibility);
  }
  if (payload.setId !== undefined) {
    sets.push(`set_id = $${i++}`);
    params.push(payload.setId);
  }
  sets.push(`updated_at = now()`);
  params.push(artifactId);

  const updated = await queryOne<ArtifactRow>(
    `UPDATE artifacts SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );

  // Log specific action if visibility changed.
  if (payload.visibility !== undefined && payload.visibility !== existing.visibility) {
    await writeAuditLog("ARTIFACT_VISIBILITY_CHANGED", ownerId, artifactId, {
      from: existing.visibility,
      to: payload.visibility,
    });
  }

  await writeAuditLog("ARTIFACT_UPDATED", ownerId, artifactId, {
    before: { title: existing.title, setId: existing.set_id },
    after: { title: updated!.title, setId: updated!.set_id },
  });
  emitActivityEvent({ userId: ownerId, eventType: "ARTIFACT_UPDATED", artifactId, details: { title: updated!.title } }).catch(() => {});

  return toArtifactSummary(updated!);
}

export async function softDeleteArtifact(ownerId: string, roomId: string, artifactId: string): Promise<void> {
  const target = await queryOne<ArtifactRow>(
    `SELECT id, title, description, tags, type, visibility, owner_id, set_id,
            created_at, updated_at, deleted_at
     FROM artifacts WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [artifactId, ownerId, roomId]
  );
  if (!target) {
    throw new ArtifactNotFoundError();
  }

  await transaction(async (tx) => {
    await tx.query(
      `UPDATE artifacts SET deleted_at = now() WHERE id = $1`,
      [artifactId]
    );

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      ["ARTIFACT_DELETED", ownerId, artifactId, JSON.stringify({ title: target.title })]
    );
  });

  emitActivityEvent({ userId: ownerId, eventType: "ARTIFACT_DELETED", artifactId, details: { title: target.title } }).catch(() => {});
}

export async function getArtifacts(
  ownerId: string,
  roomId: string,
  setId: string | null | "root",
  options: {
    tags?: string[];
    search?: string;
    type?: string;
    starred?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<PaginatedResult<ArtifactSummary>> {
  const { tags, search, type, starred } = options;
  const limit  = Math.min(options.limit  ?? 200, 500);
  const offset = options.offset ?? 0;
  const setFilter = setId === "root" ? null : setId;

  const conditions: string[] = ["a.owner_id = $1", "a.room_id = $2", "a.deleted_at IS NULL"];
  const params: unknown[] = [ownerId, roomId];
  let i = 3;

  // setId === null means "all sets" (no set filter); otherwise scope to the set.
  if (setId !== null) {
    conditions.push(`a.set_id IS NOT DISTINCT FROM $${i++}`);
    params.push(setFilter);
  }

  // Full-text search via tsvector generated column; fall back to ILIKE for short/symbol queries.
  if (search && search.trim()) {
    const tsquery = search.trim().split(/\s+/).join(" & ");
    conditions.push(
      `(a.search_vector @@ to_tsquery('english', $${i}) OR a.title ILIKE $${i + 1})`
    );
    params.push(tsquery, `%${search.trim()}%`);
    i += 2;
  }

  // jsonb containment — each tag must be present in the array (AND semantics).
  if (tags && tags.length > 0) {
    conditions.push(`a.tags @> $${i++}::jsonb`);
    params.push(JSON.stringify(tags));
  }

  // Artifact type filter.
  if (type) {
    conditions.push(`a.type = $${i++}`);
    params.push(type);
  }

  // Starred filter — inner join against the stars table.
  const starJoin = starred
    ? `JOIN stars s ON s.artifact_id = a.id AND s.user_id = $${i++}`
    : "";
  if (starred) params.push(ownerId);

  const whereClause = conditions.join(" AND ");

  const [rows, countRows] = await Promise.all([
    query<ArtifactRow>(
      `SELECT a.id, a.title, a.description, a.tags, a.type, a.visibility,
              a.owner_id, a.set_id, a.created_at, a.updated_at, a.deleted_at
       FROM artifacts a
       ${starJoin}
       WHERE ${whereClause}
       ORDER BY a.updated_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM artifacts a
       ${starJoin}
       WHERE ${whereClause}`,
      params
    ),
  ]);

  const total = parseInt(countRows[0]?.total ?? "0", 10);
  return {
    items:   rows.map(toArtifactSummary),
    total,
    hasMore: offset + rows.length < total,
    limit,
    offset,
  };
}

export async function getArtifactDetails(
  userId: string,
  roomId: string,
  artifactId: string,
  /** When true, also accept artifacts shared with this user (visibility SHARED/PUBLIC + share grant). */
  allowShared = false
): Promise<ArtifactDetail> {
  let artifact = await queryOne<ArtifactRow>(
    `SELECT id, title, description, tags, type, visibility, owner_id, set_id,
            created_at, updated_at, deleted_at
     FROM artifacts WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [artifactId, userId, roomId]
  );

  // If not the owner, try the shared/public read path.
  if (!artifact && allowShared) {
    // SHARED: grantee has an explicit share row.
    artifact = await queryOne<ArtifactRow>(
      `SELECT a.id, a.title, a.description, a.tags, a.type, a.visibility,
              a.owner_id, a.set_id, a.created_at, a.updated_at, a.deleted_at
       FROM artifacts a
       JOIN artifact_shares s ON s.artifact_id = a.id AND s.grantee_id = $2
       WHERE a.id = $1
         AND a.deleted_at IS NULL
         AND a.visibility IN ('SHARED', 'PUBLIC')`,
      [artifactId, userId]
    );
    // PUBLIC: any authenticated user can read library-published artifacts.
    if (!artifact) {
      artifact = await queryOne<ArtifactRow>(
        `SELECT id, title, description, tags, type, visibility, owner_id, set_id,
                created_at, updated_at, deleted_at
         FROM artifacts WHERE id = $1 AND deleted_at IS NULL AND visibility = 'PUBLIC'`,
        [artifactId]
      );
    }
  }

  if (!artifact) {
    throw new ArtifactNotFoundError();
  }

  const versions = await query<VersionRow>(
    `SELECT id, artifact_id, version_number, content_key, byte_size, change_summary, author_id, created_at
     FROM versions WHERE artifact_id = $1 ORDER BY version_number DESC`,
    [artifactId]
  );

  return {
    ...toArtifactSummary(artifact),
    versions: versions.map(toVersionDetail),
  };
}

/** Update the plain-text FTS content index for a TEXT artifact (best-effort). */
export async function updateArtifactFtsContent(
  ownerId: string,
  roomId: string,
  artifactId: string,
  plainText: string
): Promise<void> {
  await query(
    `UPDATE artifacts SET fts_content = $1 WHERE id = $2 AND owner_id = $3 AND room_id = $4 AND deleted_at IS NULL`,
    [plainText || null, artifactId, ownerId, roomId]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Version Operations (Linear Append-Only Ledger)
// ─────────────────────────────────────────────────────────────────────────────

export async function commitVersion(
  authorId: string,
  roomId: string,
  artifactId: string,
  payload: CommitVersionPayload
): Promise<VersionDetail> {
  const artifact = await queryOne<{ id: string }>(
    `SELECT id FROM artifacts WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [artifactId, authorId, roomId]
  );
  if (!artifact) {
    throw new ArtifactNotFoundError();
  }

  assertContentKeyNamespace(authorId, payload.contentKey);

  return transaction(async (tx) => {
    const { rows: lastRows } = await tx.query<{ version_number: number }>(
      `SELECT version_number FROM versions
       WHERE artifact_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [artifactId]
    );
    const nextVersionNumber = lastRows.length > 0 ? lastRows[0].version_number + 1 : 1;

    const byteSize = payload.byteSize ?? null;

    const { rows: versionRows } = await tx.query<VersionRow>(
      `INSERT INTO versions (artifact_id, version_number, content_key, byte_size, change_summary, author_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        artifactId,
        nextVersionNumber,
        payload.contentKey,
        byteSize,
        payload.changeSummary ?? null,
        authorId,
      ]
    );

    await tx.query(`UPDATE artifacts SET updated_at = now() WHERE id = $1`, [artifactId]);

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        "ARTIFACT_VERSION_COMMITTED",
        authorId,
        artifactId,
        JSON.stringify({ versionNumber: nextVersionNumber, contentKey: payload.contentKey, byteSize }),
      ]
    );

    // Increment storage counter outside the transaction (non-blocking, best-effort)
    if (byteSize && byteSize > 0) {
      incrementStorageUsed(authorId, byteSize).catch((e) =>
        console.error("[Storage] Failed to increment storage counter:", e)
      );
    }

    const detail = toVersionDetail(versionRows[0]);
    emitActivityEvent({ userId: authorId, eventType: "VERSION_COMMITTED", artifactId, details: { versionNumber: nextVersionNumber } }).catch(() => {});
    return detail;
  });
}

/**
 * restoreVersion
 *
 * Restores a historical version by copying its content pointer and creating
 * a new version node at the head of the linear history chain (immutable history).
 */
export async function restoreVersion(
  authorId: string,
  roomId: string,
  artifactId: string,
  versionNumber: number
): Promise<VersionDetail> {
  const artifact = await queryOne<{ id: string }>(
    `SELECT id FROM artifacts WHERE id = $1 AND owner_id = $2 AND room_id = $3 AND deleted_at IS NULL`,
    [artifactId, authorId, roomId]
  );
  if (!artifact) {
    throw new ArtifactNotFoundError();
  }

  const targetVersion = await queryOne<VersionRow>(
    `SELECT * FROM versions WHERE artifact_id = $1 AND version_number = $2`,
    [artifactId, versionNumber]
  );
  if (!targetVersion) {
    throw new VersionNotFoundError();
  }

  return transaction(async (tx) => {
    const { rows: lastRows } = await tx.query<{ version_number: number }>(
      `SELECT version_number FROM versions
       WHERE artifact_id = $1
       ORDER BY version_number DESC
       LIMIT 1`,
      [artifactId]
    );
    const nextVersionNumber = lastRows.length > 0 ? lastRows[0].version_number + 1 : 1;

    const { rows: versionRows } = await tx.query<VersionRow>(
      `INSERT INTO versions (artifact_id, version_number, content_key, change_summary, author_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        artifactId,
        nextVersionNumber,
        targetVersion.content_key,
        `Restored version ${versionNumber}.`,
        authorId,
      ]
    );

    await tx.query(`UPDATE artifacts SET updated_at = now() WHERE id = $1`, [artifactId]);

    await tx.query(
      `INSERT INTO audit_logs (action, actor_id, target_id, details)
       VALUES ($1, $2, $3, $4)`,
      [
        "ARTIFACT_VERSION_RESTORED",
        authorId,
        artifactId,
        JSON.stringify({
          restoredFromVersion: versionNumber,
          newVersionNumber: nextVersionNumber,
          contentKey: targetVersion.content_key,
        }),
      ]
    );

    const detail = toVersionDetail(versionRows[0]);
    emitActivityEvent({ userId: authorId, eventType: "VERSION_RESTORED", artifactId, details: { restoredFromVersion: versionNumber, newVersionNumber: nextVersionNumber } }).catch(() => {});
    return detail;
  });
}
