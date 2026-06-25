"use client";

import { createContext, useContext, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { SafeUser } from "@/modules/auth/types";

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

interface SessionData {
  user: SafeUser;
  activeRoomId: string | null;
}

interface AuthContextValue {
  user: SafeUser | null;
  activeRoomId: string | null;
  isLoading: boolean;
  setUser: (user: SafeUser) => void;
  refresh: () => Promise<void>;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SessionData | null>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.get<SessionData>("/api/auth/session");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const value: AuthContextValue = {
    user: data?.user ?? null,
    activeRoomId: data?.activeRoomId ?? null,
    isLoading,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
    setUser: (u: SafeUser) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, (prev: SessionData | null) =>
        prev ? { ...prev, user: u } : { user: u, activeRoomId: null }
      );
    },
    clear: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}
