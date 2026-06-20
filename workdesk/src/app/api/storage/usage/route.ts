import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, requireAdminSession } from "@/lib/session";
import {
  getStorageUsage,
  setUserQuota,
  getAllUsersStorage,
  UserNotFoundError,
} from "@/modules/archive/services/storageService";
import { SetQuotaSchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/storage/usage
//
// Returns storage usage for the calling user.
// Admins may pass ?userId=<uuid> to see another user's usage.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = req.nextUrl;
    const targetId = searchParams.get("userId");

    if (targetId) {
      // Admin-only: viewing another user's usage
      const session = await requireAdminSession();
      void session;
      const usage = await getStorageUsage(targetId);
      return NextResponse.json(ok(usage));
    }

    const session = await requireRoomSession();
    const usage = await getStorageUsage(session.userId);
    return NextResponse.json(ok(usage));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json(fail("UNAUTHORIZED", "Admin access required."), { status: 403 });
    }
    if (err instanceof UserNotFoundError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    console.error("[GET /api/storage/usage] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/storage/usage
//
// Admin only: set storage quota for a user.
// Body: { userId: uuid, quotaBytes: number }
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminSession();
    const body = await req.json();
    const parsed = SetQuotaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.format()), { status: 400 });
    }
    await setUserQuota(parsed.data.userId, parsed.data.quotaBytes);
    return NextResponse.json(ok({ updated: true }));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return NextResponse.json(fail("UNAUTHORIZED", "Admin access required."), { status: 403 });
    }
    if (err instanceof UserNotFoundError) {
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    }
    console.error("[PUT /api/storage/usage] Error:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
