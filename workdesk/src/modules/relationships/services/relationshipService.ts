import { query, queryOne } from "@/lib/db";
import { AuditAction } from "@/lib/enums";
import type { ArtifactRelationship, GraphData, GraphNode, GraphEdge } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Relationship Service
// ─────────────────────────────────────────────────────────────────────────────

export class RelationshipNotFoundError extends Error {
  readonly code = "RELATIONSHIP_NOT_FOUND";
  constructor() { super("Relationship not found."); this.name = "RelationshipNotFoundError"; }
}

export class ArtifactNotAccessibleError extends Error {
  readonly code = "ARTIFACT_NOT_FOUND";
  constructor() { super("One or both artifacts are not accessible."); this.name = "ArtifactNotAccessibleError"; }
}

export class DuplicateRelationshipError extends Error {
  readonly code = "DUPLICATE_RELATIONSHIP";
  constructor() { super("This relationship already exists."); this.name = "DuplicateRelationshipError"; }
}

export class SelfRelationshipError extends Error {
  readonly code = "SELF_RELATIONSHIP";
  constructor() { super("An artifact cannot be related to itself."); this.name = "SelfRelationshipError"; }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor(msg = "Forbidden.") { super(msg); this.name = "ForbiddenError"; }
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function writeAuditLog(action: string, actorId: string, targetId: string | null, details: Record<string, unknown>) {
  try {
    await query(`INSERT INTO audit_logs (action, actor_id, target_id, details) VALUES ($1,$2,$3,$4)`,
      [action, actorId, targetId, JSON.stringify(details)]);
  } catch { /* non-blocking */ }
}

// ── canAccess: owner OR SHARED grant OR PUBLIC ────────────────────────────────

async function canAccess(userId: string, artifactId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT a.id FROM artifacts a
     WHERE a.id = $1 AND a.deleted_at IS NULL AND (
       a.owner_id = $2
       OR a.visibility = 'PUBLIC'
       OR EXISTS (SELECT 1 FROM artifact_shares s WHERE s.artifact_id = a.id AND s.grantee_id = $2)
     )`,
    [artifactId, userId]
  );
  return row !== null;
}

// ── createRelationship ────────────────────────────────────────────────────────

export async function createRelationship(
  userId: string,
  fromId: string,
  toId: string,
  type: string
): Promise<ArtifactRelationship> {
  if (fromId === toId) throw new SelfRelationshipError();

  const [fromOk, toOk] = await Promise.all([canAccess(userId, fromId), canAccess(userId, toId)]);
  if (!fromOk || !toOk) throw new ArtifactNotAccessibleError();

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM artifact_relationships WHERE from_id = $1 AND to_id = $2 AND type = $3`,
    [fromId, toId, type]
  );
  if (existing) throw new DuplicateRelationshipError();

  const rows = await query<{
    id: string; from_id: string; from_title: string; to_id: string; to_title: string;
    type: string; created_by: string; created_by_name: string; created_at: Date;
  }>(
    `WITH ins AS (
       INSERT INTO artifact_relationships (from_id, to_id, type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *
     )
     SELECT ins.id, ins.from_id, fa.title AS from_title, ins.to_id, ta.title AS to_title,
            ins.type, ins.created_by, u.name AS created_by_name, ins.created_at
     FROM ins
     JOIN artifacts fa ON fa.id = ins.from_id
     JOIN artifacts ta ON ta.id = ins.to_id
     JOIN users u ON u.id = ins.created_by`,
    [fromId, toId, type, userId]
  );

  writeAuditLog(AuditAction.ARTIFACT_UPDATED, userId, fromId, { action: "relationship_created", toId, type }).catch(() => {});
  return rowToRelationship(rows[0]);
}

// ── deleteRelationship ────────────────────────────────────────────────────────

export async function deleteRelationship(userId: string, userRole: string, relationshipId: string): Promise<void> {
  const rel = await queryOne<{ id: string; from_id: string; created_by: string }>(
    `SELECT id, from_id, created_by FROM artifact_relationships WHERE id = $1`,
    [relationshipId]
  );
  if (!rel) throw new RelationshipNotFoundError();

  // Creator of relationship or owner of the from-artifact or admin may delete.
  if (rel.created_by !== userId && userRole !== "ADMIN") {
    const isOwner = await queryOne<{ id: string }>(
      `SELECT id FROM artifacts WHERE id = $1 AND owner_id = $2`, [rel.from_id, userId]
    );
    if (!isOwner) throw new ForbiddenError("Only the relationship creator, artifact owner, or an admin can delete this.");
  }

  await query(`DELETE FROM artifact_relationships WHERE id = $1`, [relationshipId]);
}

// ── getRelationships ──────────────────────────────────────────────────────────

export async function getRelationships(userId: string, artifactId: string): Promise<ArtifactRelationship[]> {
  const rows = await query<{
    id: string; from_id: string; from_title: string; to_id: string; to_title: string;
    type: string; created_by: string; created_by_name: string; created_at: Date;
  }>(
    `SELECT ar.id, ar.from_id, fa.title AS from_title, ar.to_id, ta.title AS to_title,
            ar.type, ar.created_by, u.name AS created_by_name, ar.created_at
     FROM artifact_relationships ar
     JOIN artifacts fa ON fa.id = ar.from_id
     JOIN artifacts ta ON ta.id = ar.to_id
     JOIN users u ON u.id = ar.created_by
     WHERE (ar.from_id = $1 OR ar.to_id = $1)
       AND fa.deleted_at IS NULL AND ta.deleted_at IS NULL
       AND (
         fa.owner_id = $2 OR fa.visibility IN ('SHARED','PUBLIC')
         OR EXISTS (SELECT 1 FROM artifact_shares s WHERE s.artifact_id = fa.id AND s.grantee_id = $2)
       )
     ORDER BY ar.created_at DESC`,
    [artifactId, userId]
  );
  return rows.map(rowToRelationship);
}

// ── getGraphData ──────────────────────────────────────────────────────────────
// Returns the full hierarchy the user can see:
// - ALWAYS: own sets/subsets/artifacts (personal archive, regardless of teamView)
// - teamView=true: adds other members as root nodes and shows ONLY their
//   Library-published (PUBLIC) artifacts, not their private/shared archives.
//
// The team-view toggle is always available regardless of how many personal
// artifacts the user has.

export async function getGraphData(userId: string, teamView = false): Promise<GraphData> {
  // 1. All sets the user owns (always shown — personal archive)
  const ownSets = await query<{ id: string; name: string; parent_id: string | null; owner_id: string }>(
    `SELECT id, name, parent_id, owner_id FROM sets WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [userId]
  );

  // 2a. User's own artifacts (always shown regardless of teamView)
  const ownArtifacts = await query<{
    id: string; title: string; type: string; visibility: string; tags: unknown;
    owner_id: string; owner_name: string; set_id: string | null;
  }>(
    `SELECT a.id, a.title, a.type, a.visibility, a.tags, a.owner_id, u.name AS owner_name, a.set_id
     FROM artifacts a
     JOIN users u ON u.id = a.owner_id
     WHERE a.deleted_at IS NULL AND a.owner_id = $1
     ORDER BY a.title`,
    [userId]
  );

  // 2b. In team view: other members' PUBLIC library-published artifacts only.
  let teamArtifacts: typeof ownArtifacts = [];
  let teamSets: typeof ownSets = [];
  let teamMembers: { id: string; name: string }[] = [];

  if (teamView) {
    teamArtifacts = await query<{
      id: string; title: string; type: string; visibility: string; tags: unknown;
      owner_id: string; owner_name: string; set_id: string | null;
    }>(
      `SELECT a.id, a.title, a.type, a.visibility, a.tags, a.owner_id, u.name AS owner_name, a.set_id
       FROM artifacts a
       JOIN users u ON u.id = a.owner_id
       WHERE a.deleted_at IS NULL
         AND a.owner_id <> $1
         AND a.visibility = 'PUBLIC'
         AND EXISTS (SELECT 1 FROM library_artifacts la WHERE la.artifact_id = a.id)
       ORDER BY a.title`,
      [userId]
    );

    const teamOwnerIds = [...new Set(teamArtifacts.map(a => a.owner_id))];

    if (teamOwnerIds.length > 0) {
      const placeholders = teamOwnerIds.map((_, i) => `$${i + 1}`).join(",");
      teamSets = await query<{ id: string; name: string; parent_id: string | null; owner_id: string }>(
        `SELECT DISTINCT s.id, s.name, s.parent_id, s.owner_id
         FROM sets s
         WHERE s.owner_id IN (${placeholders}) AND s.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM artifacts a
             JOIN library_artifacts la ON la.artifact_id = a.id
             WHERE a.set_id = s.id AND a.visibility = 'PUBLIC' AND a.owner_id = s.owner_id
           )
         ORDER BY s.name`,
        teamOwnerIds
      );
      const memberRows = await query<{ id: string; name: string }>(
        `SELECT id, name FROM users WHERE id IN (${placeholders}) ORDER BY name`,
        teamOwnerIds
      );
      teamMembers = memberRows;
    }
  }

  const artifacts = [...ownArtifacts, ...teamArtifacts];

  // 3. Artifact relationship edges (own + team PUBLIC library artifacts)
  const relRows = await query<{ id: string; from_id: string; to_id: string; type: string }>(
    `SELECT ar.id, ar.from_id, ar.to_id, ar.type
     FROM artifact_relationships ar
     JOIN artifacts fa ON fa.id = ar.from_id
     JOIN artifacts ta ON ta.id = ar.to_id
     WHERE fa.deleted_at IS NULL AND ta.deleted_at IS NULL
       AND (fa.owner_id = $1
            OR (fa.visibility = 'PUBLIC'
                AND EXISTS (SELECT 1 FROM library_artifacts la WHERE la.artifact_id = fa.id)))
       AND (ta.owner_id = $1
            OR (ta.visibility = 'PUBLIC'
                AND EXISTS (SELECT 1 FROM library_artifacts la WHERE la.artifact_id = ta.id)))`,
    [userId]
  );

  // ── Build graph nodes ─────────────────────────────────────────────────────

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allSets = [...ownSets, ...teamSets];

  // Compute depth of each set
  const setDepthMap = new Map<string, number>();
  const setParentMap = new Map<string, string | null>(allSets.map(s => [s.id, s.parent_id]));

  function setDepth(id: string): number {
    if (setDepthMap.has(id)) return setDepthMap.get(id)!;
    const parent = setParentMap.get(id);
    const d = parent ? setDepth(parent) + 1 : 1;
    setDepthMap.set(id, d);
    return d;
  }
  allSets.forEach(s => setDepth(s.id));

  if (teamView) {
    // Own member node always appears first so user sees themselves in the team view
    const selfRow = await queryOne<{ id: string; name: string }>(`SELECT id, name FROM users WHERE id = $1`, [userId]);
    if (selfRow) {
      nodes.push({ id: `member-${selfRow.id}`, type: "member", label: `${selfRow.name} (you)`, depth: 0, ownerId: selfRow.id });
    }
    teamMembers.forEach(m => {
      nodes.push({ id: `member-${m.id}`, type: "member", label: m.name, depth: 0, ownerId: m.id });
    });

    // Connect root sets to their member node
    allSets.filter(s => !s.parent_id).forEach(s => {
      edges.push({ id: `e-member-${s.owner_id}-${s.id}`, source: `member-${s.owner_id}`, target: s.id, edgeType: "hierarchy" });
    });
  }

  // Set nodes
  allSets.forEach(s => {
    const depth = setDepthMap.get(s.id) ?? 1;
    nodes.push({
      id: s.id,
      type: depth === 1 ? "set" : "subset",
      label: s.name,
      ownerId: s.owner_id,
      parentId: s.parent_id,
      depth,
    });
    if (s.parent_id) {
      edges.push({ id: `e-${s.parent_id}-${s.id}`, source: s.parent_id, target: s.id, edgeType: "hierarchy" });
    } else if (!teamView) {
      // Root sets get a virtual root edge only in personal view (no member node)
      // (handled on frontend by treating depth-1 sets as roots)
    }
  });

  // Artifact nodes
  artifacts.forEach(a => {
    const tags = Array.isArray(a.tags) ? (a.tags as string[]) : [];
    nodes.push({
      id: a.id,
      type: "artifact",
      label: a.title,
      artifactType: a.type,
      visibility: a.visibility,
      tags,
      ownerId: a.owner_id,
      ownerName: a.owner_name,
      parentId: a.set_id,
      depth: a.set_id ? (setDepthMap.get(a.set_id) ?? 1) + 1 : (teamView ? 2 : 1),
    });
    if (a.set_id) {
      edges.push({ id: `e-${a.set_id}-${a.id}`, source: a.set_id, target: a.id, edgeType: "hierarchy" });
    }
  });

  // Relationship edges
  relRows.forEach(r => {
    edges.push({
      id: `rel-${r.id}`,
      source: r.from_id,
      target: r.to_id,
      edgeType: "relationship",
      relationshipType: r.type as ArtifactRelationship["type"],
    });
  });

  return { nodes, edges };
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToRelationship(r: {
  id: string; from_id: string; from_title: string; to_id: string; to_title: string;
  type: string; created_by: string; created_by_name: string; created_at: Date;
}): ArtifactRelationship {
  return {
    id: r.id,
    fromId: r.from_id,
    fromTitle: r.from_title,
    toId: r.to_id,
    toTitle: r.to_title,
    type: r.type as ArtifactRelationship["type"],
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  };
}
