import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, requireRoomSession, UnauthenticatedError, ForbiddenError, NoRoomError } from "@/lib/session";
import { transferOwnership, OwnershipTransferError } from "@/modules/archive/services/ownershipService";
import { ok, fail } from "@/types/common";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/archive/ownership
//
// Admin-only. Transfers ownership of an artifact or set to another active user.
// Body: { kind: "artifact"|"set", itemId: uuid, newOwnerId: uuid }
// ─────────────────────────────────────────────────────────────────────────────

const TransferOwnershipSchema = z.object({
  kind: z.enum(["artifact", "set"]),
  itemId: z.string().uuid("Invalid item ID."),
  newOwnerId: z.string().uuid("Invalid user ID."),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAdminSession();

    const body: unknown = await req.json();
    const parsed = TransferOwnershipSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const { kind, itemId, newOwnerId } = parsed.data;
    await transferOwnership(session.userId, kind, itemId, newOwnerId);
    return NextResponse.json(ok(null), { status: 200 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ForbiddenError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof OwnershipTransferError) {
      const status = err.code === "ITEM_NOT_FOUND" || err.code === "USER_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(fail(err.code, err.message), { status });
    }
    console.error("[PUT /api/archive/ownership]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
