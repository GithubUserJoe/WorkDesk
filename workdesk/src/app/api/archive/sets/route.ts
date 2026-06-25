import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import {
  createSet,
  updateSet,
  softDeleteSet,
  getSets,
  getSetDetail,
  CircularReferenceError,
  SetNotFoundError,
} from "@/modules/archive/services/archiveService";
import { CreateSetSchema, UpdateSetSchema, IdParamSchema, SetDetailQuerySchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (id) {
      const detailParsed = SetDetailQuerySchema.safeParse({ id });
      if (!detailParsed.success) {
        return NextResponse.json(fail("VALIDATION_ERROR", "Invalid set ID.", detailParsed.error.format()), { status: 400 });
      }
      const detail = await getSetDetail(session.userId, session.activeRoomId, detailParsed.data.id);
      return NextResponse.json(ok(detail));
    }

    const parentId = searchParams.get("parentId") || "root";
    const limit  = parseInt(searchParams.get("limit")  ?? "200", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0",   10);

    if (parentId !== "root") {
      const parsed = IdParamSchema.safeParse({ id: parentId });
      if (!parsed.success) {
        return NextResponse.json(fail("BAD_REQUEST", "Invalid parentId format."), { status: 400 });
      }
    }

    const result = await getSets(session.userId, session.activeRoomId, parentId, {
      limit:  Number.isFinite(limit)  && limit  > 0 ? Math.min(limit,  500) : 200,
      offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    });
    return NextResponse.json(ok(result));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/archive/sets]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const body = await req.json();

    const parsed = CreateSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), { status: 400 });
    }

    const set = await createSet(session.userId, session.activeRoomId, parsed.data);
    return NextResponse.json(ok(set), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[POST /api/archive/sets]", err);
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
      return NextResponse.json(fail("BAD_REQUEST", "Set ID is required and must be a valid UUID."), { status: 400 });
    }

    const body = await req.json();
    const parsed = UpdateSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), { status: 400 });
    }

    const set = await updateSet(session.userId, session.activeRoomId, idParsed.data.id, parsed.data);
    return NextResponse.json(ok(set));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof CircularReferenceError) return NextResponse.json(fail(err.code, err.message), { status: 400 });
    console.error("[PUT /api/archive/sets]", err);
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
      return NextResponse.json(fail("BAD_REQUEST", "Set ID is required and must be a valid UUID."), { status: 400 });
    }

    await softDeleteSet(session.userId, session.activeRoomId, idParsed.data.id);
    return NextResponse.json(ok({ message: "Folder and contents soft-deleted successfully." }));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[DELETE /api/archive/sets]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
