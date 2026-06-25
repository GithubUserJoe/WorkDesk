import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserById, UserNotFoundError } from "@/modules/auth/services/authService";
import { ok, fail } from "@/types/common";

export interface SessionResponse {
  user: Awaited<ReturnType<typeof getUserById>>;
  activeRoomId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/session
//
// Returns the current session's safe user projection from the database.
// Used by the client to hydrate the auth state on page load.
//
// - Reads session cookie; returns 401 if not authenticated.
// - Fetches a fresh DB row (not stale cookie data) to reflect status changes
//   (e.g., suspension) that occurred after the session was issued.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId) {
      return NextResponse.json(
        fail("UNAUTHENTICATED", "No active session."),
        { status: 401 }
      );
    }

    // Re-fetch from DB to pick up any status/role changes since session was issued.
    const user = await getUserById(session.userId);

    // If the user has been suspended since their last login, invalidate.
    if (user.status === "SUSPENDED") {
      session.destroy();
      return NextResponse.json(
        fail("USER_SUSPENDED", "Your account has been suspended."),
        { status: 403 }
      );
    }

    return NextResponse.json(ok<SessionResponse>({ user, activeRoomId: session.activeRoomId ?? null }), { status: 200 });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      // User was deleted after session was issued — clean up.
      const session = await getSession();
      session.destroy();
      return NextResponse.json(
        fail("USER_NOT_FOUND", "Session user no longer exists."),
        { status: 401 }
      );
    }

    console.error("[GET /api/auth/session]", err);
    return NextResponse.json(
      fail("INTERNAL_ERROR", "An unexpected error occurred."),
      { status: 500 }
    );
  }
}
