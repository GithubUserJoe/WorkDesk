import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import {
  createArtifact,
  updateArtifact,
  softDeleteArtifact,
  getArtifacts,
  getArtifactDetails,
  ArtifactNotFoundError,
  SetNotFoundError,
  InvalidContentKeyError,
} from "@/modules/archive/services/archiveService";
import { CreateArtifactSchema, UpdateArtifactSchema, IdParamSchema, ListArtifactsQuerySchemaV2 } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (id) {
      const idParsed = IdParamSchema.safeParse({ id });
      if (!idParsed.success) {
        return NextResponse.json(fail("BAD_REQUEST", "Invalid ID format."), { status: 400 });
      }
      const artifact = await getArtifactDetails(session.userId, session.activeRoomId, idParsed.data.id, true);
      return NextResponse.json(ok(artifact));
    }

    const qParsed = ListArtifactsQuerySchemaV2.safeParse({
      setId:   searchParams.get("setId")   ?? undefined,
      search:  searchParams.get("search")  ?? undefined,
      tags:    searchParams.get("tags")    ?? undefined,
      type:    searchParams.get("type")    ?? undefined,
      starred: searchParams.get("starred") ?? undefined,
    });
    if (!qParsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query parameters.", qParsed.error.format()), { status: 400 });
    }

    const rawLimit  = parseInt(searchParams.get("limit")  ?? "200", 10);
    const rawOffset = parseInt(searchParams.get("offset") ?? "0",   10);
    const limit     = Number.isFinite(rawLimit)  && rawLimit  > 0 ? Math.min(rawLimit,  500) : 200;
    const offset    = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const { setId, search, tags: tagsParam, type, starred } = qParsed.data;
    const tags = tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

    const result = await getArtifacts(session.userId, session.activeRoomId, setId ?? null, { tags, search, type, starred, limit, offset });
    return NextResponse.json(ok(result));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ArtifactNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/archive/artifacts]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const body = await req.json();

    const parsed = CreateArtifactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), { status: 400 });
    }

    const artifact = await createArtifact(session.userId, session.activeRoomId, parsed.data);
    return NextResponse.json(ok(artifact), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof InvalidContentKeyError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[POST /api/archive/artifacts]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Artifact ID is required and must be a valid UUID."), { status: 400 });
    }

    const body = await req.json();
    const parsed = UpdateArtifactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), { status: 400 });
    }

    const artifact = await updateArtifact(session.userId, session.activeRoomId, idParsed.data.id, parsed.data);
    return NextResponse.json(ok(artifact));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ArtifactNotFoundError || err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[PUT /api/archive/artifacts]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Artifact ID is required and must be a valid UUID."), { status: 400 });
    }

    await softDeleteArtifact(session.userId, session.activeRoomId, idParsed.data.id);
    return NextResponse.json(ok({ message: "Artifact soft-deleted successfully." }));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ArtifactNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[DELETE /api/archive/artifacts]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
