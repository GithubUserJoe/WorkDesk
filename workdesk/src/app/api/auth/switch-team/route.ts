import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { SESSION_OPTIONS, type SessionData, UnauthenticatedError } from "@/lib/session";
import { isMemberOfRoom } from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/switch-team
//
// Switches the caller's active workspace to the requested room.
// Validates that the caller is actually a member of the target room before
// sealing the new activeRoomId into the session cookie.
//
// The client does window.location.href = '/dashboard' after success so that
// all in-memory React Query caches are flushed (full page reload).
// ─────────────────────────────────────────────────────────────────────────────

const SwitchTeamSchema = z.object({
  roomId: z.string().uuid(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);

    if (!session.isLoggedIn || !session.userId) {
      throw new UnauthenticatedError();
    }

    const body: unknown = await req.json();
    const parsed = SwitchTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()),
        { status: 400 }
      );
    }

    const { roomId } = parsed.data;

    // Security: verify the user is actually a member of the target room.
    const isMember = await isMemberOfRoom(session.userId, roomId);
    if (!isMember) {
      return NextResponse.json(
        fail("ROOM_NOT_FOUND", "Room not found or you are not a member."),
        { status: 403 }
      );
    }

    session.activeRoomId = roomId;
    await session.save();

    return NextResponse.json(ok({ activeRoomId: roomId }));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[POST /api/auth/switch-team]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
