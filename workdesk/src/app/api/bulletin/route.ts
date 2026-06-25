import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
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
    const session = await requireActiveRoomSession();
    const { searchParams } = req.nextUrl;
    const parsed = ListBulletinsQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query.", parsed.error.flatten()), { status: 400 });

    const items = await listBulletins(session.userId, session.activeRoomId, {
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });
    return NextResponse.json(ok(items));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/bulletin]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const body: unknown = await req.json();
    const parsed = CreateBulletinSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const bulletin = await createBulletin(session.userId, session.activeRoomId, parsed.data);
    return NextResponse.json(ok(bulletin), { status: 201 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[POST /api/bulletin]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
