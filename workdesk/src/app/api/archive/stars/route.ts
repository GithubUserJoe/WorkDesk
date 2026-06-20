import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
import {
  starTarget,
  unstarTarget,
  listStarred,
  StarTargetNotFoundError,
  AlreadyStarredError,
  NotStarredError,
} from "@/modules/archive/services/starService";
import { ToggleStarSchema, StarQuerySchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/archive/stars
//
// Returns all starred artifacts and sets for the authenticated user.
// Response: { artifacts: ArtifactSummary[], sets: SetSummary[] }
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const starred = await listStarred(session.userId);
    return NextResponse.json(ok(starred));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[GET /api/archive/stars] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/archive/stars
//
// Stars an artifact or set.
// Body: { targetType: "artifact" | "set", targetId: string }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const body = await req.json();

    const parsed = ToggleStarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.format()), { status: 400 });
    }

    const star = await starTarget(session.userId, parsed.data.targetType, parsed.data.targetId);
    return NextResponse.json(ok(star), { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof StarTargetNotFoundError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    if (err instanceof AlreadyStarredError) {
      return NextResponse.json(fail(err.code, err.message), { status: 409 });
    }
    console.error("[POST /api/archive/stars] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/archive/stars
//
// Unstars an artifact or set.
// Query: ?targetType=artifact|set&targetId=<uuid>
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;

    const parsed = StarQuerySchema.safeParse({
      targetType: searchParams.get("targetType"),
      targetId: searchParams.get("targetId"),
    });
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query parameters.", parsed.error.format()), {
        status: 400,
      });
    }

    await unstarTarget(session.userId, parsed.data.targetType, parsed.data.targetId);
    return NextResponse.json(ok({ message: "Unstarred successfully." }));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof NotStarredError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    console.error("[DELETE /api/archive/stars] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
