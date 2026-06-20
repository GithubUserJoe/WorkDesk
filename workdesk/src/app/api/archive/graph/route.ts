import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { getGraphData } from "@/modules/relationships/services/relationshipService";

// GET /api/archive/graph?teamView=true
export async function GET(req: NextRequest) {
  try {
    const session = await requireRoomSession();
    const teamView = req.nextUrl.searchParams.get("teamView") === "true";
    const data = await getGraphData(session.userId, teamView);
    return NextResponse.json(ok(data));
  } catch (err) {
    if ((err as { name?: string }).name === "UnauthenticatedError") return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    console.error("[GET /api/archive/graph]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
