import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { getActivityFeed } from "@/modules/activity/services/activityService";
import { ok, fail } from "@/types/common";

// GET /api/activity/feed?limit=20
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(50, Math.max(1, parseInt(limitParam, 10))) : 20;
    const feed = await getActivityFeed(session.userId, session.activeRoomId, limit);
    return NextResponse.json(ok(feed), { status: 200 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/activity/feed]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
