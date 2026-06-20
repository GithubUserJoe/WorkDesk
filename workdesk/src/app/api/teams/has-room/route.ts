import { NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { hasAnyRoom } from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teams/has-room
// Returns { hasRoom: boolean }. Used by the app layout to redirect first-time
// users who have no team memberships to /onboarding before they reach the app.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const result  = await hasAnyRoom(session.userId);
    return NextResponse.json(ok({ hasRoom: result }));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/teams/has-room]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
