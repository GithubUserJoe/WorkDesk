import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/archive/sets
//
// Fetches list of sets matching parent folder query (defaults to root folders).
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (id) {
      const detailParsed = SetDetailQuerySchema.safeParse({ id });
      if (!detailParsed.success) {
        return NextResponse.json(fail("VALIDATION_ERROR", "Invalid set ID.", detailParsed.error.format()), {
          status: 400,
        });
      }
      const detail = await getSetDetail(session.userId, detailParsed.data.id);
      return NextResponse.json(ok(detail));
    }

    const parentId = searchParams.get("parentId") || "root";

    if (parentId !== "root") {
      const parsed = IdParamSchema.safeParse({ id: parentId });
      if (!parsed.success) {
        return NextResponse.json(fail("BAD_REQUEST", "Invalid parentId format."), { status: 400 });
      }
    }

    const sets = await getSets(session.userId, parentId);
    return NextResponse.json(ok(sets));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[GET /api/archive/sets] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/archive/sets
//
// Creates a new folder/set in the archive workspace.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const body = await req.json();

    const parsed = CreateSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), {
        status: 400,
      });
    }

    const set = await createSet(session.userId, parsed.data);
    return NextResponse.json(ok(set), { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof SetNotFoundError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    console.error("[POST /api/archive/sets] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/archive/sets
//
// Renames or relocates (re-parents) an existing set/folder.
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Set ID is required and must be a valid UUID."), {
        status: 400,
      });
    }

    const body = await req.json();
    const parsed = UpdateSetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input data.", parsed.error.format()), {
        status: 400,
      });
    }

    const set = await updateSet(session.userId, idParsed.data.id, parsed.data);
    return NextResponse.json(ok(set));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof SetNotFoundError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    if (err instanceof CircularReferenceError) {
      return NextResponse.json(fail(err.code, err.message), { status: 400 });
    }
    console.error("[PUT /api/archive/sets] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/archive/sets
//
// Soft-deletes the folder, its subfolders, and all contained artifacts.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Set ID is required and must be a valid UUID."), {
        status: 400,
      });
    }

    await softDeleteSet(session.userId, idParsed.data.id);
    return NextResponse.json(ok({ message: "Folder and contents soft-deleted successfully." }));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof SetNotFoundError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    console.error("[DELETE /api/archive/sets] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
