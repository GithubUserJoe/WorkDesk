import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, NoRoomError, NoActiveRoomError, UnauthenticatedError } from "@/lib/session";
import {
  commitVersion,
  restoreVersion,
  ArtifactNotFoundError,
  VersionNotFoundError,
  InvalidContentKeyError,
} from "@/modules/archive/services/archiveService";
import { CommitVersionSchema, RestoreVersionSchema, IdParamSchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/archive/artifacts/[id]/versions
//
// Commits a new immutable version record linked to the target artifact.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { id } = await params;

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Invalid artifact ID format."), { status: 400 });
    }

    const body = await req.json();
    const parsed = CommitVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), { status: 400 });
    }

    const version = await commitVersion(session.userId, session.activeRoomId, idParsed.data.id, parsed.data);
    return NextResponse.json(ok(version), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ArtifactNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof InvalidContentKeyError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[POST versions]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/archive/artifacts/[id]/versions
//
// Restores a historical version by appending its key as a new version node.
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { id } = await params;

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Invalid artifact ID format."), { status: 400 });
    }

    const body = await req.json();
    const parsed = RestoreVersionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), { status: 400 });
    }

    const version = await restoreVersion(session.userId, session.activeRoomId, idParsed.data.id, parsed.data.versionNumber);
    return NextResponse.json(ok(version));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ArtifactNotFoundError || err instanceof VersionNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[PUT versions]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
