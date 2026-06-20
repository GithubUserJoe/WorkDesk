import { randomBytes } from "crypto";
import { query, queryOne, transaction } from "@/lib/db";
import { RoomMemberRole } from "@/lib/enums";
import type { TeamRoom, RoomMembership, RoomMember, RoomDetail } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Team Room Service
//
// All business logic for creating, joining, and querying Team Rooms.
// No SQL lives in route handlers — it all lives here.
// ─────────────────────────────────────────────────────────────────────────────

// ── Typed errors ─────────────────────────────────────────────────────────────

export class RoomNotFoundError extends Error {
  readonly code = "ROOM_NOT_FOUND";
  constructor() {
    super("Team Room not found.");
    this.name = "RoomNotFoundError";
  }
}

export class InvalidJoinCodeError extends Error {
  readonly code = "INVALID_JOIN_CODE";
  constructor() {
    super("Invalid or expired join code.");
    this.name = "InvalidJoinCodeError";
  }
}

export class AlreadyMemberError extends Error {
  readonly code = "ALREADY_MEMBER";
  constructor() {
    super("You are already a member of this Team Room.");
    this.name = "AlreadyMemberError";
  }
}

export class NotRoomOwnerError extends Error {
  readonly code = "NOT_ROOM_OWNER";
  constructor() {
    super("Only the room owner can perform this action.");
    this.name = "NotRoomOwnerError";
  }
}

export class CannotLeaveAsOwnerError extends Error {
  readonly code = "CANNOT_LEAVE_AS_OWNER";
  constructor() {
    super("The room owner cannot leave. Transfer ownership or delete the room.");
    this.name = "CannotLeaveAsOwnerError";
  }
}

export class NotMemberError extends Error {
  readonly code = "NOT_MEMBER";
  constructor() {
    super("You are not a member of this Team Room.");
    this.name = "NotMemberError";
  }
}

// ── Join code generation ──────────────────────────────────────────────────────

// Charset guarantees lowercase, uppercase, digits, and special characters
// in a single pool, so a random 32-char draw virtually always hits all classes.
// We enforce the class requirement explicitly to make it deterministic.
const CHARSET_LOWER   = "abcdefghijklmnopqrstuvwxyz";
const CHARSET_UPPER   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARSET_DIGITS  = "0123456789";
const CHARSET_SPECIAL = "!@#$%^&*";
const CHARSET_FULL    = CHARSET_LOWER + CHARSET_UPPER + CHARSET_DIGITS + CHARSET_SPECIAL;

/**
 * Generates a cryptographically secure 32-character join code that is
 * guaranteed to contain at least one lowercase letter, one uppercase letter,
 * one digit, and one special character.
 *
 * Uses Node.js `crypto.randomBytes` — never Math.random().
 */
function generateJoinCode(): string {
  const CODE_LENGTH = 32;

  // Rejection-sampling loop — bias from modulo is negligible for charset sizes
  // this small, but we loop to guarantee all character classes appear.
  while (true) {
    const bytes = randomBytes(CODE_LENGTH);
    const chars = Array.from(bytes, (b) => CHARSET_FULL[b % CHARSET_FULL.length]);
    const code  = chars.join("");

    // Enforce at least one of each required class
    const hasLower   = CHARSET_LOWER.split("").some(c => code.includes(c));
    const hasUpper   = CHARSET_UPPER.split("").some(c => code.includes(c));
    const hasDigit   = CHARSET_DIGITS.split("").some(c => code.includes(c));
    const hasSpecial = CHARSET_SPECIAL.split("").some(c => code.includes(c));

    if (hasLower && hasUpper && hasDigit && hasSpecial) {
      return code;
    }
    // Extremely unlikely — retry
  }
}

/**
 * Generates a unique join code by retrying until the DB UNIQUE constraint
 * would not be violated. In practice, collision probability is negligible
 * (charset^32 possibilities), so this almost never retries.
 */
async function generateUniqueJoinCode(): Promise<string> {
  while (true) {
    const code = generateJoinCode();
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM team_rooms WHERE join_code = $1`,
      [code]
    );
    if (!existing) return code;
    // Collision — retry (astronomically rare)
  }
}

// ── Raw row shapes ────────────────────────────────────────────────────────────

interface RoomRow {
  id: string;
  name: string;
  join_code: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

interface MembershipRow {
  room_id: string;
  room_name: string;
  owner_id: string;
  owner_name: string;
  member_count: string;
  role: string;
  joined_at: Date;
  created_at: Date;
}

interface MemberRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  joined_at: Date;
}

// ── createRoom ────────────────────────────────────────────────────────────────

/**
 * Creates a new Team Room and enrolls the creator as OWNER.
 * Returns the full room (including join code) to the creator.
 */
export async function createRoom(ownerId: string, name: string): Promise<TeamRoom> {
  const joinCode = await generateUniqueJoinCode();

  return transaction(async (tx) => {
    const { rows: [room] } = await tx.query<RoomRow>(
      `INSERT INTO team_rooms (name, join_code, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, join_code, owner_id, created_at, updated_at`,
      [name, joinCode, ownerId]
    );

    await tx.query(
      `INSERT INTO room_memberships (room_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [room.id, ownerId]
    );

    return {
      id: room.id,
      name: room.name,
      joinCode: room.join_code,
      ownerId: room.owner_id,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
    };
  });
}

// ── joinRoom ──────────────────────────────────────────────────────────────────

/**
 * Joins an existing room by join code.
 * Throws if the code is invalid or the user is already a member.
 */
export async function joinRoom(userId: string, joinCode: string): Promise<RoomMembership> {
  const room = await queryOne<RoomRow>(
    `SELECT id, name, join_code, owner_id, created_at, updated_at
     FROM team_rooms WHERE join_code = $1`,
    [joinCode]
  );
  if (!room) throw new InvalidJoinCodeError();

  const existing = await queryOne<{ room_id: string }>(
    `SELECT room_id FROM room_memberships WHERE room_id = $1 AND user_id = $2`,
    [room.id, userId]
  );
  if (existing) throw new AlreadyMemberError();

  await query(
    `INSERT INTO room_memberships (room_id, user_id, role) VALUES ($1, $2, 'MEMBER')`,
    [room.id, userId]
  );

  return getMyRoomById(userId, room.id);
}

// ── listMyRooms ───────────────────────────────────────────────────────────────

/**
 * Returns all rooms the user currently belongs to, with their role and member count.
 */
export async function listMyRooms(userId: string): Promise<RoomMembership[]> {
  const rows = await query<MembershipRow>(
    `SELECT
       rm.room_id,
       tr.name          AS room_name,
       tr.owner_id,
       u.name           AS owner_name,
       COUNT(all_rm.user_id)::text AS member_count,
       rm.role,
       rm.joined_at,
       tr.created_at
     FROM room_memberships rm
     JOIN team_rooms tr ON tr.id = rm.room_id
     JOIN users u       ON u.id  = tr.owner_id
     JOIN room_memberships all_rm ON all_rm.room_id = rm.room_id
     WHERE rm.user_id = $1
     GROUP BY rm.room_id, tr.name, tr.owner_id, u.name, rm.role, rm.joined_at, tr.created_at
     ORDER BY rm.joined_at ASC`,
    [userId]
  );

  return rows.map(mapMembershipRow);
}

// ── getMyRoomById ─────────────────────────────────────────────────────────────

export async function getMyRoomById(userId: string, roomId: string): Promise<RoomMembership> {
  const row = await queryOne<MembershipRow>(
    `SELECT
       rm.room_id,
       tr.name          AS room_name,
       tr.owner_id,
       u.name           AS owner_name,
       COUNT(all_rm.user_id)::text AS member_count,
       rm.role,
       rm.joined_at,
       tr.created_at
     FROM room_memberships rm
     JOIN team_rooms tr ON tr.id = rm.room_id
     JOIN users u       ON u.id  = tr.owner_id
     JOIN room_memberships all_rm ON all_rm.room_id = rm.room_id
     WHERE rm.user_id = $1 AND rm.room_id = $2
     GROUP BY rm.room_id, tr.name, tr.owner_id, u.name, rm.role, rm.joined_at, tr.created_at`,
    [userId, roomId]
  );
  if (!row) throw new RoomNotFoundError();
  return mapMembershipRow(row);
}

// ── getRoomDetail ─────────────────────────────────────────────────────────────

/**
 * Returns full room detail including member list and join code.
 * Only the room owner receives the join code — callers must enforce this.
 */
export async function getRoomDetail(userId: string, roomId: string): Promise<RoomDetail> {
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  if (!membership) throw new NotMemberError();

  const room = await queryOne<RoomRow>(
    `SELECT id, name, join_code, owner_id, created_at, updated_at
     FROM team_rooms WHERE id = $1`,
    [roomId]
  );
  if (!room) throw new RoomNotFoundError();

  const memberRows = await query<MemberRow>(
    `SELECT rm.user_id, u.name, u.email, rm.role, rm.joined_at
     FROM room_memberships rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1
     ORDER BY rm.joined_at ASC`,
    [roomId]
  );

  const members: RoomMember[] = memberRows.map(r => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role as RoomMemberRole,
    joinedAt: r.joined_at,
  }));

  return {
    id: room.id,
    name: room.name,
    joinCode: room.join_code,
    ownerId: room.owner_id,
    memberCount: members.length,
    members,
    createdAt: room.created_at,
    updatedAt: room.updated_at,
  };
}

// ── listRoomMembers ───────────────────────────────────────────────────────────

export async function listRoomMembers(userId: string, roomId: string): Promise<RoomMember[]> {
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  if (!membership) throw new NotMemberError();

  const rows = await query<MemberRow>(
    `SELECT rm.user_id, u.name, u.email, rm.role, rm.joined_at
     FROM room_memberships rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1
     ORDER BY rm.joined_at ASC`,
    [roomId]
  );

  return rows.map(r => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role as RoomMemberRole,
    joinedAt: r.joined_at,
  }));
}

// ── leaveRoom ─────────────────────────────────────────────────────────────────

/**
 * Removes the user from a room.
 * The OWNER cannot leave — they must delete the room or transfer ownership.
 */
export async function leaveRoom(userId: string, roomId: string): Promise<void> {
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  if (!membership) throw new NotMemberError();
  if (membership.role === RoomMemberRole.OWNER) throw new CannotLeaveAsOwnerError();

  await query(
    `DELETE FROM room_memberships WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
}

// ── deleteRoom ────────────────────────────────────────────────────────────────

/**
 * Deletes a room and all its memberships.
 * Only the owner may delete.
 */
export async function deleteRoom(userId: string, roomId: string): Promise<void> {
  const room = await queryOne<{ owner_id: string }>(
    `SELECT owner_id FROM team_rooms WHERE id = $1`,
    [roomId]
  );
  if (!room) throw new RoomNotFoundError();
  if (room.owner_id !== userId) throw new NotRoomOwnerError();

  await transaction(async (tx) => {
    await tx.query(`DELETE FROM room_memberships WHERE room_id = $1`, [roomId]);
    await tx.query(`DELETE FROM team_rooms WHERE id = $1`, [roomId]);
  });
}

// ── hasAnyRoom ────────────────────────────────────────────────────────────────

/**
 * Returns true if the user belongs to at least one room.
 * Used by the proxy to decide whether to redirect to onboarding.
 */
export async function hasAnyRoom(userId: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM room_memberships WHERE user_id = $1
     ) AS exists`,
    [userId]
  );
  return row?.exists ?? false;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapMembershipRow(r: MembershipRow): RoomMembership {
  return {
    roomId: r.room_id,
    roomName: r.room_name,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    memberCount: parseInt(r.member_count, 10),
    role: r.role as RoomMemberRole,
    joinedAt: r.joined_at,
    createdAt: r.created_at,
  };
}
