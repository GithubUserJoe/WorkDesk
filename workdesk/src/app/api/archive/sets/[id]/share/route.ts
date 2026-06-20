import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { z } from "zod";
import {
  shareSet,
  ArtifactNotFoundOrPrivateError,
  GranteeNotFoundError,
  CannotShareWithSelfError,
} from "@/modules/sharing/services/shareService";

const Schema = z.object({ granteeEmail: z.string().email() });

// POST /api/archive/sets/[id]/share — share all artifacts in a set with a user

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const { id: setId } = await params;
    const body: unknown = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const result = await shareSet(session.userId, setId, parsed.data.granteeEmail);
    return NextResponse.json(ok(result), { status: 200 });
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundOrPrivateError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof GranteeNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof CannotShareWithSelfError)
      return NextResponse.json(fail(err.code, err.message), { status: 400 });
    console.error("[POST /api/archive/sets/[id]/share]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
