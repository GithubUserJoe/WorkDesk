import { query, queryOne, transaction } from "@/lib/db";
import { TrashItem } from "../types";
import { emitActivityEvent } from "@/modules/activity/services/activityService";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Trash Service (Slice 4)
//
// Soft-deleted items are already flagged via deleted_at in the baseline schema.
// This service layers on top: list, restore, and permanent-delete (with file GC).
//
// Retention: 30 days from deleted_at. The purge job (purgeExpiredTrash) is
// called from the trash API GET route on every page load — lightweight enough
// for V1 since trash is per-user and purge only touches rows older than 30d.
// ─────────────────────────────────────────────────────────────────────────────

const TRASH_RETENTION_DAYS = 30;
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

// ── Typed errors ──────────────────────────────────────────────────────────────

export class TrashItemNotFoundError extends Error {
  readonly code = "TRASH_ITEM_NOT_FOUND";
  constructor() {
    super("Item not found in trash.");
    this.name = "TrashItemNotFoundError";
  }
}

// ── File GC helper ────────────────────────────────────────────────────────────

function deleteStoredFile(contentKey: string): void {
  if (process.env.USE_LOCAL_STORAGE !== "true") return; // R2 GC handled separately
  try {
    const filePath = path.resolve(UPLOADS_ROOT, contentKey);
    // Safety: must remain inside uploads root
    if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) return;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // GC failures are non-fatal — log and continue
    console.error(`[TrashGC] Failed to delete file for key: ${contentKey}`);
  }
}

// ── Row shapes ────────────────────────────────────────────────────────────────

interface TrashedArtifactRow {
  id: string;
  title: string;
  type: string;
  deleted_at: Date;
}

interface TrashedSetRow {
  id: string;
  name: string;
  deleted_at: Date;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** List all soft-deleted artifacts and sets owned by this user in the active room. */
export async function listTrash(ownerId: string, roomId: string): Promise<TrashItem[]> {
  const [artifacts, sets] = await Promise.all([
    query<TrashedArtifactRow>(
      `SELECT id, title, type, deleted_at
       FROM artifacts
       WHERE owner_id = $1 AND room_id = $2 AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`,
      [ownerId, roomId]
    ),
    query<TrashedSetRow>(
      `SELECT id, name, deleted_at
       FROM sets
       WHERE owner_id = $1 AND room_id = $2 AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`,
      [ownerId, roomId]
    ),
  ]);

  const toExpiry = (d: Date) => new Date(d.getTime() + TRASH_RETENTION_DAYS * 86400_000);

  const items: TrashItem[] = [
    ...artifacts.map((a) => ({
      id: a.id,
      kind: "artifact" as const,
      title: a.title,
      type: a.type,
      deletedAt: a.deleted_at,
      expiresAt: toExpiry(a.deleted_at),
    })),
    ...sets.map((s) => ({
      id: s.id,
      kind: "set" as const,
      title: s.name,
      deletedAt: s.deleted_at,
      expiresAt: toExpiry(s.deleted_at),
    })),
  ];

  // Newest-deleted first
  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

/** Restore a soft-deleted artifact or set (clears deleted_at). */
export async function restoreFromTrash(
  ownerId: string,
  kind: "artifact" | "set",
  id: string
): Promise<void> {
  if (kind === "artifact") {
    const result = await query<{ id: string }>(
      `UPDATE artifacts SET deleted_at = NULL, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
       RETURNING id`,
      [id, ownerId]
    );
    if (result.length === 0) throw new TrashItemNotFoundError();
    emitActivityEvent({ userId: ownerId, eventType: "ARTIFACT_RESTORED", artifactId: id }).catch(() => {});
  } else {
    // Restore the set itself. Artifacts inside it remain soft-deleted — user
    // must restore them individually (matches expected trash UX).
    const result = await query<{ id: string }>(
      `UPDATE sets SET deleted_at = NULL, updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
       RETURNING id`,
      [id, ownerId]
    );
    if (result.length === 0) throw new TrashItemNotFoundError();
    emitActivityEvent({ userId: ownerId, eventType: "SET_RESTORED", setId: id }).catch(() => {});
  }
}

/**
 * Permanently delete a single artifact or set.
 * For artifacts: deletes all version rows + GCs files + subtracts storage.
 * For sets: only deletes the set row (artifacts inside must be permanently
 *   deleted individually — they show up as separate trash items).
 */
export async function permanentDelete(
  ownerId: string,
  kind: "artifact" | "set",
  id: string
): Promise<void> {
  if (kind === "artifact") {
    // Fetch content keys + sizes before deleting rows
    const versions = await query<{ content_key: string; byte_size: number | null }>(
      `SELECT v.content_key, v.byte_size
       FROM versions v
       JOIN artifacts a ON a.id = v.artifact_id
       WHERE a.id = $1 AND a.owner_id = $2 AND a.deleted_at IS NOT NULL`,
      [id, ownerId]
    );
    if (versions.length === 0) {
      // Verify the artifact exists and is trashed before bailing
      const exists = await queryOne<{ id: string }>(
        `SELECT id FROM artifacts WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL`,
        [id, ownerId]
      );
      if (!exists) throw new TrashItemNotFoundError();
    }

    const totalBytes = versions.reduce((sum, v) => sum + (v.byte_size ?? 0), 0);

    await transaction(async (tx) => {
      // versions cascade-delete with artifact (ON DELETE CASCADE in schema)
      await tx.query(
        `DELETE FROM artifacts WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL`,
        [id, ownerId]
      );
      // Decrement storage counter (floor at 0)
      if (totalBytes > 0) {
        await tx.query(
          `UPDATE users
           SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1)
           WHERE id = $2`,
          [totalBytes, ownerId]
        );
      }
    });

    // GC files after DB commit (non-fatal)
    for (const v of versions) {
      deleteStoredFile(v.content_key);
    }
  } else {
    const result = await query<{ id: string }>(
      `DELETE FROM sets WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL RETURNING id`,
      [id, ownerId]
    );
    if (result.length === 0) throw new TrashItemNotFoundError();
  }
}

/**
 * Purge all items whose 30-day window has expired.
 * Called lazily on trash list requests — no background job needed for V1.
 */
export async function purgeExpiredTrash(ownerId: string): Promise<void> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400_000);

  // Artifacts: fetch content keys first, then delete
  const expiredArtifacts = await query<{ id: string }>(
    `SELECT id FROM artifacts
     WHERE owner_id = $1 AND deleted_at IS NOT NULL AND deleted_at < $2`,
    [ownerId, cutoff]
  );

  for (const { id } of expiredArtifacts) {
    try {
      await permanentDelete(ownerId, "artifact", id);
    } catch {
      // Non-fatal: already gone or race condition
    }
  }

  // Sets: just hard-delete the rows
  await query(
    `DELETE FROM sets WHERE owner_id = $1 AND deleted_at IS NOT NULL AND deleted_at < $2`,
    [ownerId, cutoff]
  );
}
