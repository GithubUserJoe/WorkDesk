"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { GraphData, CreateRelationshipPayload, GraphRelationshipEdge } from "./types";

export const graphKeys = {
  graph: () => ["graph"] as const,
};

export function useGraphData() {
  return useQuery<GraphData>({
    queryKey: graphKeys.graph(),
    queryFn: () => api.get<GraphData>("/api/archive/relationships"),
    staleTime: 5 * 60_000, // graph data changes infrequently; avoid re-fetching on every focus
    refetchOnWindowFocus: false,
  });
}

export function useCreateRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRelationshipPayload) =>
      api.post<GraphRelationshipEdge>("/api/archive/relationships", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: graphKeys.graph() }),
  });
}

export function useDeleteRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete("/api/archive/relationships", { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: graphKeys.graph() }),
  });
}
