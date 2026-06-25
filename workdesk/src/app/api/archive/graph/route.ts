import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { getGraphData } from "@/modules/relationships/services/relationshipService";

// GET /api/archive/graph?teamView=true
export async function GET(req: NextRequest) {
  try {
    const session = await requireActiveRoomSession();
    const teamView = req.nextUrl.searchParams.get("teamView") === "true";
    const data = await getGraphData(session.userId, session.activeRoomId, teamView);
    return NextResponse.json(ok(data));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/archive/graph]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
