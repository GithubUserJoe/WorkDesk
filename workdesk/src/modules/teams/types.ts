import { RoomMemberRole } from "@/lib/enums";

// ─────────────────────────────────────────────────────────────────────────────
// Teams Module Types
// ─────────────────────────────────────────────────────────────────────────────

/** A Team Room — the organisational unit that scopes all WorkDesk modules. */
export interface TeamRoom {
  id: string;
  name: string;
  joinCode: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A room as seen by its current member: includes their role and join date. */
export interface RoomMembership {
  roomId: string;
  roomName: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  role: RoomMemberRole;
  joinedAt: Date;
  createdAt: Date;
}

/** One member entry inside a room (for the members list view). */
export interface RoomMember {
  userId: string;
  name: string;
  email: string;
  role: RoomMemberRole;
  joinedAt: Date;
}

/** Full room detail — returned to the room owner only (includes the join code). */
export interface RoomDetail extends TeamRoom {
  memberCount: number;
  members: RoomMember[];
}
