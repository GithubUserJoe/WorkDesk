import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { JoinRoomSchema } from "@/modules/teams/schemas";
import {
  joinRoom,
  InvalidJoinCodeError,
  AlreadyMemberError,
} from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";
import { stampSession } from "@/app/api/teams/route";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teams/join
// Joins an existing Team Room by join code.
// Stamps hasRoom=true into the session cookie on success.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireSession();

    const body: unknown = await req.json();
    const parsed = JoinRoomSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const membership = await joinRoom(session.userId, parsed.data.joinCode);

    // Open the proxy gate and set the newly joined room as active.
    await stampSession(session.userId, membership.roomId);

    return NextResponse.json(ok(membership), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof InvalidJoinCodeError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof AlreadyMemberError)
      return NextResponse.json(fail(err.code, err.message), { status: 409 });
    console.error("[POST /api/teams/join]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}
