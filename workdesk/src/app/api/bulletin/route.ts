import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { CreateBulletinSchema, ListBulletinsQuerySchema } from "@/modules/bulletin/schemas";
import {
  listBulletins,
  createBulletin,
} from "@/modules/bulletin/services/bulletinService";

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/bulletin  — paginated bulletin feed (pinned first, then newest)
// POST /api/bulletin  — create announcement or countdown
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;
    const parsed = ListBulletinsQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query.", parsed.error.flatten()), { status: 400 });

    const items = await listBulletins(session.userId, {
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });
    return NextResponse.json(ok(items));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/bulletin]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const body: unknown = await req.json();
    const parsed = CreateBulletinSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const bulletin = await createBulletin(session.userId, parsed.data);
    return NextResponse.json(ok(bulletin), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[POST /api/bulletin]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
