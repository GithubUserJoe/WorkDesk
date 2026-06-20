"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ConversationSummary, ConversationDetail, MessageItem } from "./types";
import type { PaginatedResult } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// Messaging hooks
// ─────────────────────────────────────────────────────────────────────────────

const msgKeys = {
  conversations: () => ["messaging", "conversations"] as const,
  conversation: (id: string) => ["messaging", "conversation", id] as const,
  unread: () => ["messaging", "unread"] as const,
};

export function useConversations() {
  return useQuery<PaginatedResult<ConversationSummary>>({
    queryKey: msgKeys.conversations(),
    queryFn: () => api.get<PaginatedResult<ConversationSummary>>("/api/messaging/conversations"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useConversation(id: string, enabled = true) {
  return useQuery<ConversationDetail>({
    queryKey: msgKeys.conversation(id),
    queryFn: () => api.get<ConversationDetail>(`/api/messaging/conversations/${id}`),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: msgKeys.unread(),
    queryFn: () => api.get<{ count: number }>("/api/messaging/unread"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // don't poll when tab is not visible
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { body: string; artifactRefId?: string | null }) =>
      api.post<MessageItem>(
        `/api/messaging/conversations/${conversationId}/messages`,
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: msgKeys.conversation(conversationId) });
      qc.invalidateQueries({ queryKey: msgKeys.conversations() });
    },
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      otherUserId: string;
      body: string;
      artifactRefId?: string | null;
    }) =>
      api.post<{ conversationId: string; message: MessageItem }>(
        "/api/messaging/conversations",
        payload
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: msgKeys.conversations() });
      qc.invalidateQueries({ queryKey: msgKeys.unread() });
    },
  });
}
