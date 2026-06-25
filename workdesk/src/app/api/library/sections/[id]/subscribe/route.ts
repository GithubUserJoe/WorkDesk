import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import {
  subscribeSection,
  unsubscribeSection,
  SectionNotFoundError,
} from "@/modules/library/services/libraryService";

// POST   /api/library/sections/[id]/subscribe  — subscribe
// DELETE /api/library/sections/[id]/subscribe  — unsubscribe

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { id: sectionId } = await params;
    await subscribeSection(session.userId, sectionId);
    return NextResponse.json(ok({ subscribed: true }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof SectionNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[POST /api/library/sections/[id]/subscribe]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { id: sectionId } = await params;
    await unsubscribeSection(session.userId, sectionId);
    return NextResponse.json(ok({ unsubscribed: true }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[DELETE /api/library/sections/[id]/subscribe]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
