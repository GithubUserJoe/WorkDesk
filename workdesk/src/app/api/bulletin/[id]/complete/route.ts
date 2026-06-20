import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import {
  markComplete,
  BulletinNotFoundError,
} from "@/modules/bulletin/services/bulletinService";

// POST /api/bulletin/[id]/complete — mark the current user's countdown assignment as done

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    await markComplete(session.userId, id);
    return NextResponse.json(ok({ completed: true }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof BulletinNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[POST /api/bulletin/[id]/complete]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
