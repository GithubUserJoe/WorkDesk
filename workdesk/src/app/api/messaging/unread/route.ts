import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { totalUnreadCount } from "@/modules/messaging/services/messagingService";

// GET /api/messaging/unread — returns { count: number } for the unread badge

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const count = await totalUnreadCount(session.userId);
    return NextResponse.json(ok({ count }));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[GET /api/messaging/unread]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
