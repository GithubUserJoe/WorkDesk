import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { RoomIdParamSchema } from "@/modules/teams/schemas";
import {
  listRoomMembers,
  leaveRoom,
  NotMemberError,
  CannotLeaveAsOwnerError,
  RoomNotFoundError,
} from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";
import { stampSession } from "@/app/api/teams/route";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teams/[id]/members
// Lists all members of a room the caller belongs to.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const { id } = RoomIdParamSchema.parse(await params);

    const members = await listRoomMembers(session.userId, id);
    return NextResponse.json(ok(members));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NotMemberError || err instanceof RoomNotFoundError)
      return NextResponse.json(fail("ROOM_NOT_FOUND", "Room not found."), { status: 404 });
    console.error("[GET /api/teams/[id]/members]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/teams/[id]/members
// Leaves a room. Owner cannot leave (must delete the room instead).
// Re-evaluates hasRoom in the session — leaving may close the gate.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const { id } = RoomIdParamSchema.parse(await params);

    await leaveRoom(session.userId, id);

    // Re-check membership — if this was the user's only room, close the gate.
    // activeRoomId is reset to next available room (or null if none).
    await stampSession(session.userId);

    return NextResponse.json(ok(null));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NotMemberError || err instanceof RoomNotFoundError)
      return NextResponse.json(fail("ROOM_NOT_FOUND", "Room not found."), { status: 404 });
    if (err instanceof CannotLeaveAsOwnerError)
      return NextResponse.json(fail(err.code, err.message), { status: 409 });
    console.error("[DELETE /api/teams/[id]/members]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
