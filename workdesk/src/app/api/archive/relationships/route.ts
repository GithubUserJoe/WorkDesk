import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
import { query } from "@/lib/db";
import { ok, fail } from "@/types/common";
import { CreateRelationshipSchema, DeleteRelationshipSchema } from "@/modules/relationships/schemas";
import {
  createRelationship,
  deleteRelationship,
  RelationshipNotFoundError,
  ArtifactNotAccessibleError,
  DuplicateRelationshipError,
  SelfRelationshipError,
  ForbiddenError,
} from "@/modules/relationships/services/relationshipService";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/archive/relationships
//
// Returns all artifacts the current user can see (own + shared + public) as
// graph nodes, plus every relationship edge between any two of those artifacts.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const userId = session.userId;

    const nodes = await query<{
      id: string;
      title: string;
      type: string;
      visibility: string;
      set_id: string | null;
      set_name: string | null;
      owner_id: string;
      owner_name: string;
      tags: unknown;
    }>(`
      SELECT
        a.id, a.title, a.type, a.visibility, a.set_id,
        s.name AS set_name,
        u.id   AS owner_id,
        u.name AS owner_name,
        a.tags
      FROM artifacts a
      JOIN users u ON u.id = a.owner_id
      LEFT JOIN sets s ON s.id = a.set_id AND s.deleted_at IS NULL
      WHERE a.deleted_at IS NULL
        AND (
          a.owner_id = $1
          OR a.visibility = 'PUBLIC'
          OR EXISTS (
            SELECT 1 FROM artifact_shares sh
            WHERE sh.artifact_id = a.id AND sh.grantee_id = $1
          )
        )
      ORDER BY a.created_at DESC
    `, [userId]);

    const visibleIds = nodes.map((n) => n.id);
    let edges: { id: string; from_id: string; to_id: string; type: string; created_by: string }[] = [];
    if (visibleIds.length > 0) {
      edges = await query<{ id: string; from_id: string; to_id: string; type: string; created_by: string }>(`
        SELECT id, from_id, to_id, type, created_by
        FROM artifact_relationships
        WHERE from_id = ANY($1::uuid[])
          AND to_id   = ANY($1::uuid[])
      `, [visibleIds]);
    }

    return NextResponse.json(ok({ nodes, edges }));
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === "UNAUTHENTICATED" || (err as { name?: string }).name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[GET /api/archive/relationships]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Failed to load graph data."), { status: 500 });
  }
}

// POST /api/archive/relationships — create a relationship between two artifacts
export async function POST(req: NextRequest) {
  try {
    const session = await requireRoomSession();
    const body = await req.json().catch(() => ({}));
    const parsed = CreateRelationshipSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const { fromId, toId, type } = parsed.data;
    const rel = await createRelationship(session.userId, fromId, toId, type);
    return NextResponse.json(ok(rel), { status: 201 });
  } catch (err) {
    if (err instanceof SelfRelationshipError) return NextResponse.json(fail(err.code, err.message), { status: 400 });
    if (err instanceof ArtifactNotAccessibleError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof DuplicateRelationshipError) return NextResponse.json(fail(err.code, err.message), { status: 409 });
    if (err instanceof ForbiddenError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if ((err as { name?: string }).name === "UnauthenticatedError") return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    console.error("[POST /api/archive/relationships]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}

// DELETE /api/archive/relationships — delete a relationship
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRoomSession();
    const body = await req.json().catch(() => ({}));
    const parsed = DeleteRelationshipSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    await deleteRelationship(session.userId, session.role, parsed.data.relationshipId);
    return NextResponse.json(ok(null));
  } catch (err) {
    if (err instanceof RelationshipNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if ((err as { name?: string }).name === "UnauthenticatedError") return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    console.error("[DELETE /api/archive/relationships]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
