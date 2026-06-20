import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { ok, fail } from "@/types/common";
import { StartConversationSchema } from "@/modules/messaging/schemas";
import {
  listConversations,
  getOrCreateConversation,
  sendMessage,
  UserNotFoundError,
} from "@/modules/messaging/services/messagingService";

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/messaging/conversations  — list conversations for current user
// POST /api/messaging/conversations  — start or resume a 1:1 conversation
//   body: { otherUserId, body, artifactRefId? }
//   Creates the conversation if it doesn't exist, then sends the first message.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = new URL(req.url);
    const rawLimit  = parseInt(searchParams.get("limit")  ?? "50", 10);
    const rawOffset = parseInt(searchParams.get("offset") ?? "0",  10);
    const result = await listConversations(session.userId, {
      limit:  Number.isFinite(rawLimit)  && rawLimit  > 0 ? Math.min(rawLimit,  200) : 50,
      offset: Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
    });
    return NextResponse.json(ok(result));
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    console.error("[GET /api/messaging/conversations]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const body: unknown = await req.json();
    const parsed = StartConversationSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const convId = await getOrCreateConversation(session.userId, parsed.data.otherUserId);
    const message = await sendMessage(
      session.userId,
      convId,
      parsed.data.body,
      parsed.data.artifactRefId ?? null
    );
    return NextResponse.json(ok({ conversationId: convId, message }), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof UserNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[POST /api/messaging/conversations]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}
