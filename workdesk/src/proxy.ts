import { NextRequest, NextResponse } from "next/server";
import { unsealData } from "iron-session";
import { SessionData, SESSION_OPTIONS } from "@/lib/session";

// Read-only: unseal the iron-session cookie directly at the edge.
// We deliberately do NOT use getIronSession(req.cookies, …) here — at the
// Next.js edge runtime the cookie-store shape iron-session expects is not
// present on NextRequest.cookies. The proxy only reads, so unsealData
// (stateless decrypt) is the correct primitive.
async function readSession(req: NextRequest): Promise<Partial<SessionData>> {
  const sealed = req.cookies.get(SESSION_OPTIONS.cookieName)?.value;
  if (!sealed) return {};
  try {
    return await unsealData<SessionData>(sealed, { password: SESSION_OPTIONS.password });
  } catch {
    // Tampered, expired, or rotated-secret cookie → treat as logged out.
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxy — Edge Route Protection (Next.js 16 Proxy Convention)
//
// Three-layer enforcement mirrors the auth pattern exactly:
//
//   Layer 1 (Edge / this file): cookie-based, zero DB cost.
//   Layer 2 (Route handlers):   requireRoomSession() → 403 NO_ROOM.
//   Layer 3 (App layout):       server-side redirect (belt-and-suspenders).
//
// Gate rules (evaluated top-to-bottom, first match wins):
//
//   1. Admin-only routes   → must be logged in + ADMIN.
//   2. Room-exempt routes  → must be logged in; room check skipped.
//        • /onboarding, /teams — onboarding flow pages
//        • /api/teams/*        — room membership mutations
//        • /api/auth/refresh-room — stamps hasRoom back into the cookie
//   3. Protected routes    → must be logged in AND hasRoom.
//        If logged in but hasRoom=false → redirect to /onboarding.
//   4. Auth routes (/login etc.) → redirect if already logged in.
// ─────────────────────────────────────────────────────────────────────────────

// Pages that need auth but NOT a room (the onboarding path).
const ROOM_EXEMPT_PAGES = ["/onboarding", "/teams"];

// API prefixes that need auth but NOT a room check.
const ROOM_EXEMPT_API_PREFIXES = ["/api/teams", "/api/auth/refresh-room", "/api/auth/switch-team"];

// Routes that require auth + room.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/archive",
  "/library",
  "/messaging",
  "/bulletin",
  "/mail-hub",
  "/graph-view",
  "/graph",
  "/settings",
  "/profile",
];

// Routes restricted to ADMIN role only.
const ADMIN_ONLY_PREFIXES = ["/settings/admin"];

// Routes that redirect authenticated users away (login, password reset, etc.).
const AUTH_ROUTES = ["/login", "/forgot-password", "/reset-password"];

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();
  const session = await readSession(req);

  const isLoggedIn    = session.isLoggedIn === true && Boolean(session.userId);
  const isAdmin       = isLoggedIn && session.role === "ADMIN";
  const hasRoom       = isLoggedIn && session.hasRoom === true;
  const hasActiveRoom = isLoggedIn && Boolean(session.activeRoomId);

  // ── Rule 1: Admin-only pages ───────────────────────────────────────────────
  if (ADMIN_ONLY_PREFIXES.some(p => pathname.startsWith(p))) {
    if (!isLoggedIn) return redirectToLogin(req);
    if (!isAdmin)    return NextResponse.redirect(new URL("/dashboard", req.url));
    return res;
  }

  // ── Rule 2: Room-exempt routes (auth required, room NOT required) ──────────
  const isRoomExemptPage = ROOM_EXEMPT_PAGES.some(
    p => pathname === p || pathname.startsWith(p + "/")
  );
  const isRoomExemptApi = ROOM_EXEMPT_API_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + "/")
  );

  if (isRoomExemptPage || isRoomExemptApi) {
    if (!isLoggedIn) return redirectToLogin(req);
    // If the user already has a room and navigates directly to /onboarding,
    // send them to the dashboard — the gate is already passed.
    if (pathname.startsWith("/onboarding") && hasRoom) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return res;
  }

  // ── Rule 3: Protected routes (auth + room + active room required) ────────────
  if (PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
    if (!isLoggedIn)    return redirectToLogin(req);
    if (!hasRoom)       return NextResponse.redirect(new URL("/onboarding", req.url));
    if (!hasActiveRoom) return NextResponse.redirect(new URL("/onboarding", req.url));
    return res;
  }

  // ── Rule 4: Auth routes (redirect away if already logged in) ──────────────
  if (AUTH_ROUTES.some(r => pathname.startsWith(r))) {
    if (isLoggedIn) {
      // Logged in but no room or no active room → onboarding; otherwise → dashboard.
      return NextResponse.redirect(
        new URL((hasRoom && hasActiveRoom) ? "/dashboard" : "/onboarding", req.url)
      );
    }
    return res;
  }

  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function redirectToLogin(req: NextRequest): NextResponse {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Matcher Config
//
// Excludes static assets and all public auth endpoints (login, signup, OTP
// flows, password reset) so they remain reachable without a session cookie.
// /api/auth/refresh-room and /api/teams/* are matched (covered by Rule 2).
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth/login|api/auth/logout|api/auth/signup|api/auth/forgot-password|api/auth/reset-password|api/auth/send-email-otp|api/auth/verify-email-otp|api/auth/send-password-otp|api/auth/verify-password-otp).*)",
  ],
};
