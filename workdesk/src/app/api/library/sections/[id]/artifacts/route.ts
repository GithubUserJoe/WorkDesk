import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { PublishArtifactSchema, UnpublishArtifactSchema } from "@/modules/library/schemas";
import {
  publishArtifact,
  unpublishArtifact,
  SectionNotFoundError,
  ArtifactNotFoundError,
  AlreadyPublishedError,
  NotPublishedError,
} from "@/modules/library/services/libraryService";

// POST   /api/library/sections/[id]/artifacts  — publish artifact to section
// DELETE /api/library/sections/[id]/artifacts  — unpublish artifact from section

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: sectionId } = await params;
    const body: unknown = await req.json();
    const parsed = PublishArtifactSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    await publishArtifact(session.userId, parsed.data.artifactId, sectionId);
    return NextResponse.json(ok({ published: true }), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof SectionNotFoundError || err instanceof ArtifactNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof AlreadyPublishedError)
      return NextResponse.json(fail(err.code, err.message), { status: 409 });
    console.error("[POST /api/library/sections/[id]/artifacts]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: sectionId } = await params;
    const body: unknown = await req.json();
    const parsed = UnpublishArtifactSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    await unpublishArtifact(session.userId, parsed.data.artifactId, sectionId);
    return NextResponse.json(ok({ unpublished: true }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof SectionNotFoundError || err instanceof ArtifactNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof NotPublishedError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[DELETE /api/library/sections/[id]/artifacts]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
