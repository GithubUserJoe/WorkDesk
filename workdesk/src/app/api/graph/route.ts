import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
import { query } from "@/lib/db";
import { fail } from "@/types/common";

// GET /api/graph?teamView=true
// Returns flat nodes+edges for the D3 canvas floating view.
// Nodes: members (kind="member"), sets (kind="set"), artifacts (kind="artifact").
// Edges: set→parent_set ("set-parent"), artifact→set ("artifact-set"),
//        member→root-set / member→orphan-artifact ("member-item").
export async function GET(req: NextRequest) {
  try {
    const session = await requireRoomSession();
    const userId = session.userId;
    const teamView = req.nextUrl.searchParams.get("teamView") === "true";

    const [ownSets, ownArtifacts] = await Promise.all([
      query<{ id: string; name: string; parent_id: string | null; owner_id: string }>(
        `SELECT id, name, parent_id, owner_id FROM sets WHERE owner_id = $1 AND deleted_at IS NULL`,
        [userId]
      ),
      query<{
        id: string; title: string; type: string;
        set_id: string | null; visibility: string;
        set_name: string | null; owner_id: string; owner_name: string;
      }>(
        `SELECT a.id, a.title, a.type, a.set_id, a.visibility,
                s.name AS set_name, a.owner_id, u.name AS owner_name
         FROM artifacts a
         LEFT JOIN sets s ON s.id = a.set_id
         JOIN users u ON u.id = a.owner_id
         WHERE a.owner_id = $1 AND a.deleted_at IS NULL`,
        [userId]
      ),
    ]);

    let teamSets: typeof ownSets = [];
    let teamArtifacts: typeof ownArtifacts = [];
    let memberRows: { id: string; name: string; is_self: boolean }[] = [];

    if (teamView) {
      teamArtifacts = await query<typeof ownArtifacts[number]>(
        `SELECT a.id, a.title, a.type, a.set_id, a.visibility,
                s.name AS set_name, a.owner_id, u.name AS owner_name
         FROM artifacts a
         LEFT JOIN sets s ON s.id = a.set_id
         JOIN users u ON u.id = a.owner_id
         WHERE a.deleted_at IS NULL
           AND a.owner_id <> $1
           AND a.visibility = 'PUBLIC'
           AND EXISTS (SELECT 1 FROM library_artifacts la WHERE la.artifact_id = a.id)`,
        [userId]
      );

      const teamOwnerIds = [...new Set(teamArtifacts.map(a => a.owner_id))];

      if (teamOwnerIds.length > 0) {
        const ph = teamOwnerIds.map((_, i) => `$${i + 1}`).join(",");
        teamSets = await query<typeof ownSets[number]>(
          `SELECT DISTINCT s.id, s.name, s.parent_id, s.owner_id
           FROM sets s
           WHERE s.owner_id IN (${ph}) AND s.deleted_at IS NULL
             AND EXISTS (
               SELECT 1 FROM artifacts a
               JOIN library_artifacts la ON la.artifact_id = a.id
               WHERE a.set_id = s.id AND a.visibility = 'PUBLIC' AND a.owner_id = s.owner_id
             )`,
          teamOwnerIds
        );
        const mRows = await query<{ id: string; name: string }>(
          `SELECT id, name FROM users WHERE id IN (${ph}) ORDER BY name`,
          teamOwnerIds
        );
        memberRows = mRows.map(m => ({ ...m, is_self: false }));
      }

      // Self always appears in team view
      const selfRow = await query<{ id: string; name: string }>(
        `SELECT id, name FROM users WHERE id = $1`,
        [userId]
      );
      if (selfRow.length > 0) {
        memberRows = [{ ...selfRow[0], is_self: true }, ...memberRows];
      }
    }

    const allSets = [...ownSets, ...teamSets];
    const allArtifacts = [...ownArtifacts, ...teamArtifacts];
    const allSetIds = new Set(allSets.map(s => s.id));

    const nodes = [
      // Member nodes (team view only)
      ...memberRows.map(m => ({
        id: `member-${m.id}`,
        label: m.is_self ? `${m.name} (you)` : m.name,
        kind: "member" as const,
        owner_id: m.id,
      })),
      // Set nodes
      ...allSets.map(s => ({
        id: s.id,
        label: s.name,
        kind: "set" as const,
        parent_id: s.parent_id,
        owner_id: s.owner_id,
      })),
      // Artifact nodes
      ...allArtifacts.map(a => ({
        id: a.id,
        label: a.title,
        kind: "artifact" as const,
        artifact_type: a.type.toLowerCase(),
        set_id: a.set_id,
        visibility: a.visibility,
        set_name: a.set_name,
        owner_id: a.owner_id,
        owner_name: a.owner_name,
      })),
    ];

    const edges: { source: string; target: string; type: "set-parent" | "artifact-set" | "member-item" }[] = [
      // Set hierarchy
      ...allSets
        .filter(s => s.parent_id && allSetIds.has(s.parent_id))
        .map(s => ({ source: s.id, target: s.parent_id!, type: "set-parent" as const })),
      // Artifact → set
      ...allArtifacts
        .filter(a => a.set_id && allSetIds.has(a.set_id))
        .map(a => ({ source: a.id, target: a.set_id!, type: "artifact-set" as const })),
    ];

    if (teamView) {
      // Root sets → their member node
      allSets
        .filter(s => !s.parent_id || !allSetIds.has(s.parent_id))
        .forEach(s => {
          edges.push({ source: `member-${s.owner_id}`, target: s.id, type: "member-item" as const });
        });
      // Orphan artifacts → their member node
      allArtifacts
        .filter(a => !a.set_id || !allSetIds.has(a.set_id))
        .forEach(a => {
          edges.push({ source: `member-${a.owner_id}`, target: a.id, type: "member-item" as const });
        });
    }

    return NextResponse.json({ nodes, edges });
  } catch (err) {
    if ((err as { name?: string }).name === "UnauthenticatedError")
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    console.error("[GET /api/graph]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
