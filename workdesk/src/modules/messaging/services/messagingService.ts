import { query, queryOne, transaction } from "@/lib/db";
import { emitActivityEvent } from "@/modules/activity/services/activityService";
import { emitNotification } from "@/modules/notifications/services/notificationService";
import type { ConversationSummary, ConversationDetail, MessageItem } from "../types";
import type { PaginatedResult } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// Messaging Service — 1:1 internal conversations
// ─────────────────────────────────────────────────────────────────────────────

export class ConversationNotFoundError extends Error {
  readonly code = "CONVERSATION_NOT_FOUND";
  constructor() { super("Conversation not found."); this.name = "ConversationNotFoundError"; }
}

export class NotConversationMemberError extends Error {
  readonly code = "NOT_CONVERSATION_MEMBER";
  constructor() { super("You are not a member of this conversation."); this.name = "NotConversationMemberError"; }
}

export class UserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND";
  constructor() { super("User not found."); this.name = "UserNotFoundError"; }
}

// ── Row shapes ────────────────────────────────────────────────────────────────

interface ConvRow {
  id: string;
  other_user_id: string;
  other_user_name: string;
  other_user_email: string;
  last_message: string | null;
  last_message_at: Date | null;
  unread_count: string;
  updated_at: Date;
}

interface MsgRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  artifact_ref_id: string | null;
  artifact_ref_title: string | null;
  artifact_ref_type: string | null;
  created_at: Date;
  edited_at: Date | null;
}

function rowToMessage(r: MsgRow): MessageItem {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    body: r.body,
    artifactRefId: r.artifact_ref_id,
    artifactRefTitle: r.artifact_ref_title,
    artifactRefType: r.artifact_ref_type,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  };
}

// ── getOrCreateConversation ───────────────────────────────────────────────────

export async function getOrCreateConversation(
  userA: string,
  userB: string
): Promise<string> {
  // Find an existing 1:1 conversation between exactly these two users.
  const existing = await queryOne<{ id: string }>(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_members ma ON ma.conversation_id = c.id AND ma.user_id = $1
     JOIN conversation_members mb ON mb.conversation_id = c.id AND mb.user_id = $2
     WHERE (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
     LIMIT 1`,
    [userA, userB]
  );
  if (existing) return existing.id;

  // Verify userB exists and is active.
  const other = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND status = 'ACTIVE'`,
    [userB]
  );
  if (!other) throw new UserNotFoundError();

  return transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO conversations DEFAULT VALUES RETURNING id`
    );
    const convId = rows[0].id;
    await tx.query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1,$2),($1,$3)`,
      [convId, userA, userB]
    );
    return convId;
  });
}

// ── listConversations ─────────────────────────────────────────────────────────

export async function listConversations(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PaginatedResult<ConversationSummary>> {
  const limit  = Math.min(options.limit  ?? 50, 200);
  const offset = options.offset ?? 0;

  const [rows, countRows] = await Promise.all([
    query<ConvRow>(
      `SELECT c.id,
              other_u.id    AS other_user_id,
              other_u.name  AS other_user_name,
              other_u.email AS other_user_email,
              (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
              (SELECT COUNT(*) FROM messages m
               WHERE m.conversation_id = c.id
                 AND m.created_at > me.last_read_at
                 AND m.sender_id <> $1) AS unread_count,
              c.updated_at
       FROM conversations c
       JOIN conversation_members me    ON me.conversation_id = c.id AND me.user_id = $1
       JOIN conversation_members other ON other.conversation_id = c.id AND other.user_id <> $1
       JOIN users other_u              ON other_u.id = other.user_id
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM conversations c
       JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1`,
      [userId]
    ),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    otherUserId: r.other_user_id,
    otherUserName: r.other_user_name,
    otherUserEmail: r.other_user_email,
    lastMessage: r.last_message,
    lastMessageAt: r.last_message_at,
    unreadCount: Number(r.unread_count),
    updatedAt: r.updated_at,
  }));
  const total = parseInt(countRows[0]?.total ?? "0", 10);
  return { items, total, hasMore: offset + items.length < total, limit, offset };
}

// ── getConversation ───────────────────────────────────────────────────────────

export async function getConversation(
  userId: string,
  conversationId: string,
  opts: { limit?: number; cursor?: string } = {}
): Promise<ConversationDetail> {
  // Verify membership.
  const member = await queryOne<{ last_read_at: Date }>(
    `SELECT last_read_at FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (!member) throw new NotConversationMemberError();

  // Other user info.
  const other = await queryOne<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email
     FROM conversation_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = $1 AND cm.user_id <> $2
     LIMIT 1`,
    [conversationId, userId]
  );
  if (!other) throw new ConversationNotFoundError();

  const limit = (opts.limit ?? 30) + 1; // fetch one extra to detect hasMore
  const params: (string | number)[] = [conversationId, limit];
  const cursorClause = opts.cursor ? `AND m.created_at < $3` : "";
  if (opts.cursor) params.push(opts.cursor);

  const rows = await query<MsgRow>(
    `SELECT m.id, m.conversation_id, m.sender_id, u.name AS sender_name,
            m.body, m.artifact_ref_id, a.title AS artifact_ref_title,
            a.type AS artifact_ref_type, m.created_at, m.edited_at
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     LEFT JOIN artifacts a ON a.id = m.artifact_ref_id
     WHERE m.conversation_id = $1 ${cursorClause}
     ORDER BY m.created_at DESC
     LIMIT $2`,
    params
  );

  const realLimit = opts.limit ?? 30;
  const hasMore = rows.length > realLimit;
  const items = hasMore ? rows.slice(0, realLimit) : rows;
  const oldest = items[items.length - 1];

  // Mark as read — update last_read_at to now (best-effort).
  query(
    `UPDATE conversation_members SET last_read_at = now()
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  ).catch(() => {});

  return {
    id: conversationId,
    otherUserId: other.id,
    otherUserName: other.name,
    otherUserEmail: other.email,
    messages: items.map(rowToMessage).reverse(), // chronological for display
    hasMore,
    nextCursor: hasMore && oldest ? oldest.created_at.toISOString() : null,
  };
}

// ── sendMessage ───────────────────────────────────────────────────────────────

export async function sendMessage(
  senderId: string,
  conversationId: string,
  body: string,
  artifactRefId: string | null = null
): Promise<MessageItem> {
  const member = await queryOne<{ id: string }>(
    `SELECT user_id AS id FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, senderId]
  );
  if (!member) throw new NotConversationMemberError();

  const msg = await transaction(async (tx) => {
    const { rows } = await tx.query<MsgRow>(
      `INSERT INTO messages (conversation_id, sender_id, body, artifact_ref_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, conversation_id, sender_id, body, artifact_ref_id, created_at, edited_at`,
      [conversationId, senderId, body, artifactRefId]
    );
    await tx.query(
      `UPDATE conversations SET updated_at = now() WHERE id = $1`,
      [conversationId]
    );
    return rows[0];
  });

  // Fetch sender name + artifact info for the returned item.
  const sender = await queryOne<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`, [senderId]
  );
  let artifactRefTitle: string | null = null;
  let artifactRefType: string | null = null;
  if (artifactRefId) {
    const art = await queryOne<{ title: string; type: string }>(
      `SELECT title, type FROM artifacts WHERE id = $1`, [artifactRefId]
    );
    artifactRefTitle = art?.title ?? null;
    artifactRefType = art?.type ?? null;
  }

  // Emit activity to the OTHER member (best-effort).
  const otherMember = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM conversation_members
     WHERE conversation_id = $1 AND user_id <> $2 LIMIT 1`,
    [conversationId, senderId]
  );
  if (otherMember) {
    emitActivityEvent({
      userId: otherMember.user_id,
      eventType: "ARTIFACT_SHARED",
      details: { conversationId, senderId, preview: body.slice(0, 80) },
    }).catch(() => {});

    // Notify the recipient (best-effort).
    emitNotification(
      otherMember.user_id,
      "MESSAGE_RECEIVED",
      `New message from ${sender?.name ?? "someone"}`,
      body.slice(0, 120),
      { conversationId, senderId }
    ).catch(() => {});
  }

  return {
    id: msg.id,
    conversationId: msg.conversation_id,
    senderId: msg.sender_id,
    senderName: sender?.name ?? "",
    body: msg.body,
    artifactRefId: msg.artifact_ref_id,
    artifactRefTitle,
    artifactRefType,
    createdAt: msg.created_at,
    editedAt: msg.edited_at,
  };
}

// ── totalUnreadCount ──────────────────────────────────────────────────────────

export async function totalUnreadCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM messages m
     JOIN conversation_members me ON me.conversation_id = m.conversation_id AND me.user_id = $1
     WHERE m.sender_id <> $1
       AND m.created_at > me.last_read_at`,
    [userId]
  );
  return Number(row?.count ?? 0);
}
