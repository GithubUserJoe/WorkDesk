import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { query } from "@/lib/db";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/members
//
// Returns id + name + email for all ACTIVE users who share at least one Team
// Room with the caller, excluding the caller themselves.
//
// Room scoping: any user visible here is guaranteed to be in a common room,
// so messaging, sharing, assignment, and bulletin flows only surface teammates.
//
// Query string:
//   ?roomId=<uuid>  — optional; restricts results to a specific room.
//                     Caller must be a member of that room or returns 403.
// ─────────────────────────────────────────────────────────────────────────────

export interface MemberSummary {
  id: string;
  name: string;
  email: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    // Always scope to the active room — no cross-team member visibility.
    const activeRoomId = session.activeRoomId;

    const members = await query<MemberSummary>(
      `SELECT u.id, u.name, u.email
       FROM room_memberships rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1
         AND u.status = 'ACTIVE'
         AND u.id <> $2
       ORDER BY u.name`,
      [activeRoomId, session.userId]
    );

    return NextResponse.json(ok(members));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/members]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
