import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { CreateSectionSchema } from "@/modules/library/schemas";
import {
  listSections,
  createSection,
} from "@/modules/library/services/libraryService";

// GET  /api/library/sections  — list all sections
// POST /api/library/sections  — create a new section

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = new URL(req.url);
    const rawLimit  = parseInt(searchParams.get("limit")  ?? "50", 10);
    const rawOffset = parseInt(searchParams.get("offset") ?? "0",  10);
    const result = await listSections(session.userId, {
      limit:  Number.isFinite(rawLimit)  && rawLimit  > 0 ? Math.min(rawLimit,  200) : 50,
      offset: Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
    });
    return NextResponse.json(ok(result));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/library/sections]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const body: unknown = await req.json();
    const parsed = CreateSectionSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const section = await createSection(session.userId, parsed.data.name, parsed.data.description ?? null);
    return NextResponse.json(ok(section), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[POST /api/library/sections]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
