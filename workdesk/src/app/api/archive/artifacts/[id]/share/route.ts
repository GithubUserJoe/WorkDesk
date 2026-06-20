import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { ShareArtifactSchema, RevokeShareSchema } from "@/modules/sharing/schemas";
import {
  shareArtifact,
  revokeShare,
  listShareGrants,
  ArtifactNotFoundOrPrivateError,
  GranteeNotFoundError,
  CannotShareWithSelfError,
  AlreadySharedError,
  ShareNotFoundError,
} from "@/modules/sharing/services/shareService";

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/archive/artifacts/[id]/share  — list grants on this artifact
// POST /api/archive/artifacts/[id]/share  — grant access to a user by email
// DELETE /api/archive/artifacts/[id]/share — revoke a grant (body: granteeId)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: artifactId } = await params;
    const grants = await listShareGrants(session.userId, artifactId);
    return NextResponse.json(ok(grants), { status: 200 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundOrPrivateError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/archive/artifacts/[id]/share]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: artifactId } = await params;
    const body: unknown = await req.json();
    const parsed = ShareArtifactSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const grant = await shareArtifact(session.userId, artifactId, parsed.data.granteeEmail);
    return NextResponse.json(ok(grant), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundOrPrivateError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof GranteeNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof CannotShareWithSelfError)
      return NextResponse.json(fail(err.code, err.message), { status: 400 });
    if (err instanceof AlreadySharedError)
      return NextResponse.json(fail(err.code, err.message), { status: 409 });
    console.error("[POST /api/archive/artifacts/[id]/share]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: artifactId } = await params;
    const body: unknown = await req.json();
    const parsed = RevokeShareSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    await revokeShare(session.userId, artifactId, parsed.data.granteeId);
    return NextResponse.json(ok({ revoked: true }), { status: 200 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundOrPrivateError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof ShareNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[DELETE /api/archive/artifacts/[id]/share]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
