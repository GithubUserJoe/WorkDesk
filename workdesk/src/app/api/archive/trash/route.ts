import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import {
  listTrash,
  restoreFromTrash,
  permanentDelete,
  purgeExpiredTrash,
  TrashItemNotFoundError,
} from "@/modules/archive/services/trashService";
import { TrashActionSchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/archive/trash
//
// Lists all soft-deleted items (artifacts + sets) owned by the session user.
// Also triggers a lazy purge of items past the 30-day retention window.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    await purgeExpiredTrash(session.userId).catch((e) => console.error("[Trash] Purge error:", e));
    const items = await listTrash(session.userId, session.activeRoomId);
    return NextResponse.json(ok(items));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/archive/trash]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/archive/trash
//
// Restores a single artifact or set from trash (clears deleted_at).
// Body: { kind: "artifact"|"set", id: uuid, action: "restore" }
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const body = await req.json();
    const parsed = TrashActionSchema.safeParse({ ...body, action: "restore" });
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.format()), { status: 400 });
    }
    await restoreFromTrash(session.userId, parsed.data.kind, parsed.data.id);
    return NextResponse.json(ok({ restored: true }));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof TrashItemNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[PUT /api/archive/trash]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { searchParams } = req.nextUrl;
    const parsed = TrashActionSchema.safeParse({
      kind: searchParams.get("kind"),
      id: searchParams.get("id"),
      action: "delete",
    });
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query parameters.", parsed.error.format()), { status: 400 });
    }
    await permanentDelete(session.userId, parsed.data.kind, parsed.data.id);
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof TrashItemNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[DELETE /api/archive/trash]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
