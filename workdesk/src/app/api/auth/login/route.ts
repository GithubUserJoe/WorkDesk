import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { LoginSchema } from "@/modules/auth/schemas";
import { verifyCredentials, InvalidCredentialsError, UserSuspendedError } from "@/modules/auth/services/authService";
import { SESSION_OPTIONS, type SessionData } from "@/lib/session";
import { hasAnyRoom } from "@/modules/teams/services/teamService";
import { ok, fail } from "@/types/common";
import { SafeUser } from "@/modules/auth/types";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
//
// Validates credentials, creates an iron-session cookie.
// Returns the safe user projection (no passwordHash).
//
// Security:
// - Input validated with Zod before any DB call.
// - bcrypt comparison is constant-time (handled in authService).
// - Generic error message prevents user enumeration.
// - Session cookie is HttpOnly, SameSite=lax, Secure in prod.
// - Existing sessions are overwritten on re-login (no session fixation).
// - "Remember me" OFF → omit maxAge → cookie expires when browser closes.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();

    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()),
        { status: 400 }
      );
    }

    const { email, password, rememberMe } = parsed.data;
    const user: SafeUser = await verifyCredentials(email, password);

    // Check room membership so the proxy gate works immediately after login
    // without a separate DB call per request.
    const hasRoom = await hasAnyRoom(user.id);

    // Build session options. If "Remember me" is off, strip maxAge so the cookie
    // becomes a session cookie (expires when the browser closes).
    const sessionOpts = rememberMe
      ? SESSION_OPTIONS
      : {
          ...SESSION_OPTIONS,
          cookieOptions: { ...SESSION_OPTIONS.cookieOptions, maxAge: undefined },
        };

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOpts);
    session.userId = user.id;
    session.email = user.email;
    session.name = user.name;
    session.role = user.role;
    session.isLoggedIn = true;
    session.hasRoom = hasRoom;
    await session.save();

    return NextResponse.json(ok(user), { status: 200 });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    }

    if (err instanceof UserSuspendedError) {
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    }

    console.error("[POST /api/auth/login]", err);
    return NextResponse.json(
      fail("INTERNAL_ERROR", "An unexpected error occurred."),
      { status: 500 }
    );
  }
}
