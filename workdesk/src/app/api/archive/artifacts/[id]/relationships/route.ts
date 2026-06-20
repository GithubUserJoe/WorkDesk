import { NextRequest, NextResponse } from "next/server";
import { requireRoomSession, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { getRelationships } from "@/modules/relationships/services/relationshipService";

// GET /api/archive/artifacts/[id]/relationships
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    const rels = await getRelationships(session.userId, id);
    return NextResponse.json(ok(rels));
  } catch (err) {
    if ((err as { name?: string }).name === "UnauthenticatedError") return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    console.error("[GET /api/archive/artifacts/[id]/relationships]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
