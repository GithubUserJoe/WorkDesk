"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { TeamRoom, RoomMembership, RoomDetail, RoomMember } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Teams Module Hooks
// ─────────────────────────────────────────────────────────────────────────────

const TEAMS_KEY = ["teams"] as const;
const roomKey   = (id: string) => ["teams", id] as const;
const membersKey = (id: string) => ["teams", id, "members"] as const;

// ── useMyRooms ────────────────────────────────────────────────────────────────

/** All rooms the current user belongs to. */
export function useMyRooms() {
  return useQuery({
    queryKey: TEAMS_KEY,
    queryFn: () => api.get<RoomMembership[]>("/api/teams"),
    staleTime: 30_000,
  });
}

// ── useRoomDetail ─────────────────────────────────────────────────────────────

/** Full detail (members + join code) for a single room. */
export function useRoomDetail(roomId: string) {
  return useQuery({
    queryKey: roomKey(roomId),
    queryFn: () => api.get<RoomDetail>(`/api/teams/${roomId}`),
    staleTime: 30_000,
    enabled: Boolean(roomId),
  });
}

// ── useRoomMembers ────────────────────────────────────────────────────────────

export function useRoomMembers(roomId: string) {
  return useQuery({
    queryKey: membersKey(roomId),
    queryFn: () => api.get<RoomMember[]>(`/api/teams/${roomId}/members`),
    staleTime: 30_000,
    enabled: Boolean(roomId),
  });
}

// ── useCreateRoom ─────────────────────────────────────────────────────────────

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<TeamRoom>("/api/teams", { name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
    },
  });
}

// ── useJoinRoom ───────────────────────────────────────────────────────────────

export function useJoinRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (joinCode: string) =>
      api.post<RoomMembership>("/api/teams/join", { joinCode }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
    },
  });
}

// ── useLeaveRoom ──────────────────────────────────────────────────────────────

export function useLeaveRoom(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<null>(`/api/teams/${roomId}/members`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
      qc.removeQueries({ queryKey: roomKey(roomId) });
    },
  });
}

// ── useDeleteRoom ─────────────────────────────────────────────────────────────

export function useDeleteRoom(roomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<null>(`/api/teams/${roomId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TEAMS_KEY });
      qc.removeQueries({ queryKey: roomKey(roomId) });
    },
  });
}
