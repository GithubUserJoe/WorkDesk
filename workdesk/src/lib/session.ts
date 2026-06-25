import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { Role } from "@/lib/enums";

// ─────────────────────────────────────────────────────────────────────────────
// Session Data Shape
//
// The session cookie carries the minimum trusted payload needed to enforce
// auth, RBAC, and room-gating at the proxy/route-handler level without a
// DB round-trip.
//
// hasRoom: true once the user belongs to ≥1 Team Room. Stamped at login and
//   refreshed by POST /api/auth/refresh-room after any room membership change.
//   The proxy reads this flag to enforce the onboarding hard gate at the edge.
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  role: Role;
  isLoggedIn: boolean;
  hasRoom: boolean;
  activeRoomId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// iron-session Options
// ─────────────────────────────────────────────────────────────────────────────

export const SESSION_OPTIONS: SessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "workdesk.session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7 - 60, // 7 days minus 60s
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// getSession
// ─────────────────────────────────────────────────────────────────────────────

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);
}

// ─────────────────────────────────────────────────────────────────────────────
// requireSession
// Throws UnauthenticatedError if no valid session exists.
// ─────────────────────────────────────────────────────────────────────────────

export async function requireSession(): Promise<SessionData> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    throw new UnauthenticatedError();
  }
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    isLoggedIn: session.isLoggedIn,
    hasRoom: session.hasRoom ?? false,
    activeRoomId: session.activeRoomId ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireRoomSession
//
// Extends requireSession with a Team Room membership assertion.
// Use on every route that requires an active room context — i.e. everything
// except /api/auth/* and /api/teams/* (which are exempt by design).
//
// Throws NoRoomError (→ 403 NO_ROOM) when the user has no room.
// The client maps this to a redirect to /onboarding.
// ─────────────────────────────────────────────────────────────────────────────

export async function requireRoomSession(): Promise<SessionData> {
  const sessionData = await requireSession();
  if (!sessionData.hasRoom) {
    throw new NoRoomError();
  }
  return sessionData;
}

// ─────────────────────────────────────────────────────────────────────────────
// requireActiveRoomSession
//
// Extends requireRoomSession with an active room assertion.
// All data-access routes call this to get the team tenant boundary.
// Returns sessionData typed to guarantee activeRoomId is non-null.
// ─────────────────────────────────────────────────────────────────────────────

export async function requireActiveRoomSession(): Promise<SessionData & { activeRoomId: string }> {
  const sessionData = await requireRoomSession();
  if (!sessionData.activeRoomId) {
    throw new NoActiveRoomError();
  }
  return sessionData as SessionData & { activeRoomId: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// requireAdminSession
// ─────────────────────────────────────────────────────────────────────────────

export async function requireAdminSession(): Promise<SessionData> {
  const sessionData = await requireSession();
  if (sessionData.role !== "ADMIN") {
    throw new ForbiddenError();
  }
  return sessionData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed Auth Errors
// ─────────────────────────────────────────────────────────────────────────────

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("Authentication required.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor() {
    super("Insufficient permissions.");
    this.name = "ForbiddenError";
  }
}

export class NoRoomError extends Error {
  readonly code = "NO_ROOM";
  constructor() {
    super("You must belong to a Team Room to access this resource.");
    this.name = "NoRoomError";
  }
}

export class NoActiveRoomError extends Error {
  readonly code = "NO_ACTIVE_ROOM";
  constructor() {
    super("No active team selected. Please switch to a team.");
    this.name = "NoActiveRoomError";
  }
}
