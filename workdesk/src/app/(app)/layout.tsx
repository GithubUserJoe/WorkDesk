import { Sidebar } from "@/components/shell/sidebar";

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated app shell layout.
//
// Auth + room gating is enforced at three layers:
//   1. Edge proxy (src/proxy.ts) — reads session.hasRoom from the cookie;
//      redirects unauthenticated users to /login and room-less users to
//      /onboarding with zero DB cost.
//   2. Route handlers — requireRoomSession() → 403 NO_ROOM on any API call
//      that bypasses the proxy (curl, direct fetch, etc.).
//   3. This layout is the happy path — no DB calls here; trust the layers above.
// ─────────────────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-primary">
      <Sidebar />
      <main className="ml-sidebar-width flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
