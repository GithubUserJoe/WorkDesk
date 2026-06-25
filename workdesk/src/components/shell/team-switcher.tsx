"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Building2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { RoomMembership } from "@/modules/teams/types";

// ─────────────────────────────────────────────────────────────────────────────
// TeamSwitcher — shows the active team and lets the user switch between rooms.
// ─────────────────────────────────────────────────────────────────────────────

export function TeamSwitcher() {
  const router = useRouter();
  const { activeRoomId, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: rooms } = useQuery<RoomMembership[]>({
    queryKey: ["teams", "my-rooms"],
    queryFn: () => api.get<RoomMembership[]>("/api/teams"),
    staleTime: 60_000,
  });

  const activeRoom = rooms?.find((r) => r.roomId === activeRoomId);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function switchTo(roomId: string) {
    if (roomId === activeRoomId || switching) return;
    setSwitching(true);
    setOpen(false);
    try {
      await api.post("/api/auth/switch-team", { roomId });
      await refresh();
      router.push("/dashboard");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-border-default bg-surface-container px-3 py-2 text-left text-sm transition-colors hover:bg-surface-container-high"
      >
        <Building2 size={14} strokeWidth={1.8} className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
          {switching ? "Switching…" : (activeRoom?.roomName ?? "No active team")}
        </span>
        {switching ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-text-tertiary" />
        ) : (
          <ChevronDown size={13} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
        )}
      </button>

      {open && rooms && rooms.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-md border border-border-default bg-surface-overlay shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Your Teams
          </p>
          <ul>
            {rooms.map((room) => {
              const isActive = room.roomId === activeRoomId;
              return (
                <li key={room.roomId}>
                  <button
                    type="button"
                    onClick={() => switchTo(room.roomId)}
                    className={
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors " +
                      (isActive
                        ? "bg-surface-container-high text-primary"
                        : "text-text-primary hover:bg-surface-container")
                    }
                  >
                    <span className="flex-1 truncate">{room.roomName}</span>
                    {isActive && <Check size={13} strokeWidth={2} className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border-default">
            <button
              type="button"
              onClick={() => { setOpen(false); router.push("/teams"); }}
              className="flex w-full items-center px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
            >
              Manage teams…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
