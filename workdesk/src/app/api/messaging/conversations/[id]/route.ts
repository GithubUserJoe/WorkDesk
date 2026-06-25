import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { ListMessagesQuerySchema } from "@/modules/messaging/schemas";
import {
  getConversation,
  ConversationNotFoundError,
  NotConversationMemberError,
} from "@/modules/messaging/services/messagingService";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messaging/conversations/[id]
// Returns conversation detail with paginated messages (newest-first cursor).
// Also marks the conversation as read for the caller.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { id: conversationId } = await params;
    const { searchParams } = req.nextUrl;
    const parsed = ListMessagesQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query.", parsed.error.flatten()), { status: 400 });

    const detail = await getConversation(session.userId, conversationId, {
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });
    return NextResponse.json(ok(detail));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ConversationNotFoundError || err instanceof NotConversationMemberError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/messaging/conversations/[id]]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
