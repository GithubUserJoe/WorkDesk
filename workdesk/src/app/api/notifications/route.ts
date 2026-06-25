import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession } from "@/lib/session";
import {
  listNotifications,
  getNotificationCounts,
  markAllRead,
} from "@/modules/notifications/services/notificationService";
import { ok, fail } from "@/types/common";

// GET /api/notifications          → list (last 30) + unread count
// POST /api/notifications/read-all → mark all read (handled separately)

export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const [notifications, counts] = await Promise.all([
      listNotifications(session.userId),
      getNotificationCounts(session.userId),
    ]);
    return NextResponse.json(ok({ notifications, counts }));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[Notifications GET]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error."), { status: 500 });
  }
}

export async function PATCH(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    await markAllRead(session.userId);
    return NextResponse.json(ok(null));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[Notifications PATCH]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error."), { status: 500 });
  }
}
