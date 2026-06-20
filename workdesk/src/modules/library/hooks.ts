"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LibrarySectionSummary, LibraryArtifactItem } from "./types";
import type { PaginatedResult } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// Library hooks
// ─────────────────────────────────────────────────────────────────────────────

const libKeys = {
  all: () => ["library"] as const,
  sections: () => ["library", "sections"] as const,
  section: (id: string) => ["library", "section", id] as const,
  artifactSections: (artifactId: string) => ["library", "artifact-sections", artifactId] as const,
};

export function useLibrarySections() {
  return useQuery<PaginatedResult<LibrarySectionSummary>>({
    queryKey: libKeys.sections(),
    queryFn: () => api.get<PaginatedResult<LibrarySectionSummary>>("/api/library/sections"),
    staleTime: 30_000,
  });
}

export function useLibrarySectionArtifacts(sectionId: string, enabled = true) {
  return useQuery<LibraryArtifactItem[]>({
    queryKey: libKeys.section(sectionId),
    queryFn: () => api.get<LibraryArtifactItem[]>(`/api/library/sections/${sectionId}`),
    enabled,
    staleTime: 30_000,
  });
}

export function useArtifactSections(artifactId: string, enabled = true) {
  return useQuery<{ id: string; name: string }[]>({
    queryKey: libKeys.artifactSections(artifactId),
    queryFn: () =>
      api.get<{ id: string; name: string }[]>(
        `/api/library/artifact-sections?artifactId=${artifactId}`
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string | null }) =>
      api.post<LibrarySectionSummary>("/api/library/sections", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.sections() }),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api.delete(`/api/library/sections/${sectionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.all() }),
  });
}

export function usePublishArtifact(sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artifactId: string) =>
      api.post(`/api/library/sections/${sectionId}/artifacts`, { artifactId }),
    onSuccess: (_data, artifactId) => {
      qc.invalidateQueries({ queryKey: libKeys.section(sectionId) });
      qc.invalidateQueries({ queryKey: libKeys.artifactSections(artifactId) });
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useUnpublishArtifact(sectionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artifactId: string) =>
      api.deleteWithBody(`/api/library/sections/${sectionId}/artifacts`, { artifactId }),
    onSuccess: (_data, artifactId) => {
      qc.invalidateQueries({ queryKey: libKeys.section(sectionId) });
      qc.invalidateQueries({ queryKey: libKeys.artifactSections(artifactId) });
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useSubscribeSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api.post(`/api/library/sections/${sectionId}/subscribe`),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.sections() }),
  });
}

export function useUnsubscribeSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api.delete(`/api/library/sections/${sectionId}/subscribe`),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.sections() }),
  });
}

export function usePublishSetToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) =>
      api.post<{ sectionId: string; publishedCount: number }>("/api/library/publish-set", { setId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: libKeys.sections() });
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}
