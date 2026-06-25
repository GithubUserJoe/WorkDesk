import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { getRelationships } from "@/modules/relationships/services/relationshipService";

// GET /api/archive/artifacts/[id]/relationships
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireActiveRoomSession();
    const { id } = await params;
    const rels = await getRelationships(session.userId, id);
    return NextResponse.json(ok(rels));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/archive/artifacts/[id]/relationships]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
