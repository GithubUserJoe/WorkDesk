import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import {
  getSectionArtifacts,
  deleteSection,
  SectionNotFoundError,
  ForbiddenError,
} from "@/modules/library/services/libraryService";

// GET    /api/library/sections/[id]  — section artifact list
// DELETE /api/library/sections/[id]  — delete section (creator or admin)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    void session; // auth check only; section is public to all members
    const { id } = await params;
    const artifacts = await getSectionArtifacts(id);
    return NextResponse.json(ok(artifacts));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof SectionNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/library/sections/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    await deleteSection(session.userId, session.role, id);
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof SectionNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof ForbiddenError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[DELETE /api/library/sections/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
