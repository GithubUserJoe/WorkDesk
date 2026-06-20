import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { requireSession, SESSION_OPTIONS, type SessionData, UnauthenticatedError } from "@/lib/session";
import { CreateRoomSchema } from "@/modules/teams/schemas";
import {
  createRoom,
  listMyRooms,
  hasAnyRoom,
} from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/teams
// Returns all Team Rooms the current user belongs to.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const rooms = await listMyRooms(session.userId);
    return NextResponse.json(ok(rooms));
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/teams]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teams
// Creates a new Team Room and makes the caller the OWNER.
// Stamps hasRoom=true into the session cookie on success.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireSession();

    const body: unknown = await req.json();
    const parsed = CreateRoomSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const room = await createRoom(session.userId, parsed.data.name);

    // Stamp hasRoom=true immediately so the proxy gate opens on the next request.
    await stampHasRoom(session.userId);

    return NextResponse.json(ok(room), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[POST /api/teams]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Something went wrong."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// stampHasRoom — re-checks room membership and writes it into the session
// cookie so the edge proxy gate reflects the current state without a DB call.
// ─────────────────────────────────────────────────────────────────────────────

export async function stampHasRoom(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);
  if (!session.isLoggedIn || !session.userId) return;
  session.hasRoom = await hasAnyRoom(userId);
  await session.save();
}
