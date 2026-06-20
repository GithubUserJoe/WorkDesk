import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { SendMessageSchema } from "@/modules/messaging/schemas";
import {
  sendMessage,
  NotConversationMemberError,
} from "@/modules/messaging/services/messagingService";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messaging/conversations/[id]/messages
// Send a message to an existing conversation.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: conversationId } = await params;
    const body: unknown = await req.json();
    const parsed = SendMessageSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const message = await sendMessage(
      session.userId,
      conversationId,
      parsed.data.body,
      parsed.data.artifactRefId ?? null
    );
    return NextResponse.json(ok(message), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NotConversationMemberError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    console.error("[POST /api/messaging/conversations/[id]/messages]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
