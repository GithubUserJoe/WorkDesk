import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { getArtifactSections } from "@/modules/library/services/libraryService";

// GET /api/library/artifact-sections?artifactId=<uuid>
// Returns sections that contain the given artifact.

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireRoomSession();
    const artifactId = req.nextUrl.searchParams.get("artifactId");
    if (!artifactId)
      return NextResponse.json(fail("BAD_REQUEST", "artifactId is required."), { status: 400 });

    const sections = await getArtifactSections(artifactId);
    return NextResponse.json(ok(sections));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/library/artifact-sections]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
