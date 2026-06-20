import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdminSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { z } from "zod";
import {
  getBulletin,
  deleteBulletin,
  pinBulletin,
  markComplete,
  BulletinNotFoundError,
  ForbiddenError,
} from "@/modules/bulletin/services/bulletinService";

// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/bulletin/[id]           — bulletin detail + assignments
// DELETE /api/bulletin/[id]           — author or admin delete
// PUT    /api/bulletin/[id]           — admin pin/unpin
// POST   /api/bulletin/[id]/complete  — mark your own countdown assignment done
// ─────────────────────────────────────────────────────────────────────────────

const PinSchema = z.object({ pinned: z.boolean() });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    const bulletin = await getBulletin(session.userId, id);
    return NextResponse.json(ok(bulletin));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof BulletinNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/bulletin/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    await deleteBulletin(session.userId, session.role, id);
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof BulletinNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    if (err instanceof ForbiddenError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[DELETE /api/bulletin/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body: unknown = await req.json();
    const parsed = PinSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    await pinBulletin(session.userId, id, parsed.data.pinned);
    return NextResponse.json(ok({ pinned: parsed.data.pinned }));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof BulletinNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[PUT /api/bulletin/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
