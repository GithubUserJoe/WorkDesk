"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Megaphone, MessageSquare, BookOpen,
  GitFork, Archive, Users, Star, Trash2, UserCircle2,
  Settings2, LogOut, Share2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { Brand } from "@/components/brand";
import { StorageUsageBar } from "@/components/shell/storage-usage-bar";
import { useUnreadCount } from "@/modules/messaging/hooks";
import { NotificationBell } from "@/components/notifications/notification-bell";

// ─────────────────────────────────────────────────────────────────────────────
// Persistent left sidebar (V1 nav only).
//
// Per PLAN-v1: V1 surfaces Dashboard, Archive, Settings, Profile. V2 items
// (Library, Messages, Bulletin, Mail Hub, Graph) are intentionally omitted until
// their modules exist. Bottom area = storage usage + user card + logout.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const I = { size: 18, strokeWidth: 1.8, className: "shrink-0" } as const;

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",       label: "Dashboard",     icon: <LayoutDashboard  {...I} /> },
  { href: "/bulletin",        label: "Bulletin",       icon: <Megaphone        {...I} /> },
  { href: "/messaging",       label: "Messages",       icon: <MessageSquare    {...I} /> },
  { href: "/library",         label: "Library",        icon: <BookOpen         {...I} /> },
  { href: "/graph",           label: "Graph View",     icon: <GitFork          {...I} /> },
  { href: "/archive",         label: "Archive",        icon: <Archive          {...I} /> },
  { href: "/archive/shared",    label: "Shared with me",  icon: <Users            {...I} /> },
  { href: "/archive/my-shares", label: "Shared Archive",  icon: <Share2           {...I} /> },
  { href: "/archive/starred",   label: "Starred",          icon: <Star             {...I} /> },
  { href: "/archive/trash",   label: "Trash",          icon: <Trash2           {...I} /> },
  { href: "/profile",         label: "Profile",        icon: <UserCircle2      {...I} /> },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/settings", label: "Settings", icon: <Settings2 {...I} /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clear } = useAuth();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  async function handleLogout() {
    try {
      await api.post("/api/auth/logout");
    } finally {
      clear();
      router.push("/login");
    }
  }

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-sidebar-width flex-col border-r border-border-default bg-surface-secondary px-2 py-4">
      {/* Brand */}
      <div className="mb-8 px-2">
        <Brand size={32} />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
        {(() => {
          const nav = [...NAV_ITEMS, ...(user?.role === "ADMIN" ? ADMIN_NAV_ITEMS : [])];
          return nav.map((item) => {
          const exactMatch = pathname === item.href;
          const prefixMatch = !exactMatch && pathname.startsWith(item.href + "/");
          const deeperActive = prefixMatch && nav.some(
            (other) => other.href !== item.href && (pathname === other.href || pathname.startsWith(other.href + "/"))
          );
          const active = exactMatch || (prefixMatch && !deeperActive);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex items-center gap-3 rounded px-3 h-9 text-sm transition-colors " +
                (active
                  ? "bg-surface-container-high font-semibold text-primary"
                  : "text-text-secondary hover:bg-surface-container hover:text-text-primary")
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.href === "/messaging" && unreadCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        });
        })()}
      </nav>

      {/* Bottom: notifications + storage usage + user + logout */}
      <div className="mt-auto space-y-2 border-t border-border-default px-1 pt-4">
        <NotificationBell />
        <StorageUsageBar />
        <div className="flex items-center gap-3 rounded border border-border-default bg-surface-container-low p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-sm font-semibold text-text-primary">
            {(user?.name ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-text-primary">{user?.name ?? "—"}</p>
            <p className="truncate text-xs text-text-secondary">{user?.email ?? ""}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-container hover:text-danger"
        >
          <LogOut {...I} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
