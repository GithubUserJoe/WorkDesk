import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { z } from "zod";
import {
  publishSetToLibrary,
  ArtifactNotFoundError,
} from "@/modules/library/services/libraryService";

const Schema = z.object({ setId: z.string().uuid() });

// POST /api/library/publish-set
// Creates a library section named after the set and publishes all its artifacts into it.

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const body: unknown = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const result = await publishSetToLibrary(session.userId, parsed.data.setId);
    return NextResponse.json(ok(result), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[POST /api/library/publish-set]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
