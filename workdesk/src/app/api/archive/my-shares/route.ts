import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthenticatedError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { listMyShares } from "@/modules/sharing/services/shareService";

// GET /api/archive/my-shares — outgoing shares (artifacts the user shared with others)

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireSession();
    const items = await listMyShares(session.userId);
    return NextResponse.json(ok(items), { status: 200 });
  } catch (err) {
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/archive/my-shares]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
