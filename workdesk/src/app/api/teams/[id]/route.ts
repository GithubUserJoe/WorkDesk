import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { RoomIdParamSchema } from "@/modules/teams/schemas";
import {
  getRoomDetail,
  deleteRoom,
  RoomNotFoundError,
  NotRoomOwnerError,
  NotMemberError,
} from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";
import { stampHasRoom } from "@/app/api/teams/route";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teams/[id]
// Returns full room detail (members list + join code) for a room the caller
// belongs to.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const { id } = RoomIdParamSchema.parse(await params);

    const detail = await getRoomDetail(session.userId, id);
    return NextResponse.json(ok(detail));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof RoomNotFoundError || err instanceof NotMemberError)
      return NextResponse.json(fail("ROOM_NOT_FOUND", "Room not found."), { status: 404 });
    console.error("[GET /api/teams/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/teams/[id]
// Deletes a room and all its memberships. Owner only.
// Re-evaluates hasRoom in the session after deletion.
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const { id } = RoomIdParamSchema.parse(await params);

    await deleteRoom(session.userId, id);

    // Re-check — owner may now have zero rooms, which closes the gate.
    await stampHasRoom(session.userId);

    return NextResponse.json(ok(null));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof RoomNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof NotRoomOwnerError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[DELETE /api/teams/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
