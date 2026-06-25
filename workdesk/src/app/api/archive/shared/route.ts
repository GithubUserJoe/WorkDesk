import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { listSharedWithMe } from "@/modules/sharing/services/shareService";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/archive/shared
// Returns artifacts that other users have shared with the current user.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const items = await listSharedWithMe(session.userId, session.activeRoomId);
    return NextResponse.json(ok(items), { status: 200 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/archive/shared]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
