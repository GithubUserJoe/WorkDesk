import { NextRequest, NextResponse } from "next/server";
import { requireRoomSession, NoRoomError } from "@/lib/session";
import {
  markRead,
  deleteNotification,
} from "@/modules/notifications/services/notificationService";
import { ok, fail } from "@/types/common";

// PATCH /api/notifications/[id]  → mark single notification read
// DELETE /api/notifications/[id] → delete notification

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    await markRead(session.userId, id);
    return NextResponse.json(ok(null));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[Notification PATCH]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error."), { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id } = await params;
    await deleteNotification(session.userId, id);
    return NextResponse.json(ok(null));
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[Notification DELETE]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error."), { status: 500 });
  }
}
