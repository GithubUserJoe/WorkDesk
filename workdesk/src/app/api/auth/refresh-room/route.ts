import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { SESSION_OPTIONS, type SessionData, UnauthenticatedError } from "@/lib/session";
import { hasAnyRoom, getFirstRoomId } from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh-room
//
// Re-checks whether the authenticated user belongs to at least one Team Room
// and writes the result into session.hasRoom. Must be called by the client
// after any room membership change (create, join, leave, delete) so that the
// proxy gate reflects the new state on the next request.
//
// Returns { hasRoom: boolean } so the client can redirect without an extra
// roundtrip.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);

    if (!session.isLoggedIn || !session.userId) {
      throw new UnauthenticatedError();
    }

    const [hasRoom, firstRoomId] = await Promise.all([
      hasAnyRoom(session.userId),
      getFirstRoomId(session.userId),
    ]);
    session.hasRoom = hasRoom;
    // Only update activeRoomId if it isn't already set to a valid room.
    if (!session.activeRoomId) {
      session.activeRoomId = firstRoomId;
    }
    await session.save();

    return NextResponse.json(ok({ hasRoom, activeRoomId: session.activeRoomId ?? null }));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[POST /api/auth/refresh-room]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
