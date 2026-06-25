import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { recordOpen } from "@/modules/activity/services/activityService";
import { ok, fail } from "@/types/common";
import { z } from "zod";

// POST /api/activity/record-open  body: { artifactId: uuid }
const Schema = z.object({ artifactId: z.string().uuid() });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const body: unknown = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    await recordOpen(session.userId, parsed.data.artifactId);
    return NextResponse.json(ok(null), { status: 200 });
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[POST /api/activity/record-open]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
