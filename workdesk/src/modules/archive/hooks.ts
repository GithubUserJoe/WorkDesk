"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  SetSummary,
  SetDetail,
  ArtifactSummary,
  ArtifactDetail,
  VersionDetail,
  StarSummary,
  StarredLists,
  StarTargetType,
  TrashItem,
  TrashItemKind,
  StorageUsage,
  CreateSetPayload,
  UpdateSetPayload,
  CreateArtifactPayload,
  UpdateArtifactPayload,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Archive data hooks (TanStack Query) over the existing /api/archive routes.
//
// Query-key scheme:
//   ["archive","sets", parentId]      → child sets of a parent ("root" | uuid)
//   ["archive","set", id]             → SetDetail (children + artifacts)
//   ["archive","artifacts", {…}]      → artifact list for a scope/search/tags
//   ["archive","artifact", id]        → ArtifactDetail (+ versions)
// ─────────────────────────────────────────────────────────────────────────────

export const archiveKeys = {
  sets: (parentId: string) => ["archive", "sets", parentId] as const,
  set: (id: string) => ["archive", "set", id] as const,
  artifacts: (scope: { setId?: string | null; search?: string; tags?: string; type?: string; starred?: boolean }) =>
    ["archive", "artifacts", scope] as const,
  artifact: (id: string) => ["archive", "artifact", id] as const,
  stars: () => ["archive", "stars"] as const,
  trash: () => ["archive", "trash"] as const,
  storage: () => ["storage", "usage"] as const,
};

// ── Sets: queries ────────────────────────────────────────────────────────────

export function useSets(parentId: string = "root") {
  return useQuery<SetSummary[]>({
    queryKey: archiveKeys.sets(parentId),
    queryFn: () => api.get<SetSummary[]>("/api/archive/sets", { params: { parentId } }),
  });
}

export function useSetDetail(id: string | null) {
  return useQuery<SetDetail>({
    queryKey: archiveKeys.set(id ?? "none"),
    queryFn: () => api.get<SetDetail>("/api/archive/sets", { params: { id: id! } }),
    enabled: Boolean(id),
  });
}

// ── Sets: mutations ──────────────────────────────────────────────────────────

export function useCreateSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSetPayload) => api.post<SetSummary>("/api/archive/sets", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

export function useUpdateSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSetPayload }) =>
      api.put<SetSummary>("/api/archive/sets", payload, { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

export function useDeleteSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete("/api/archive/sets", { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

// ── Artifacts: queries ───────────────────────────────────────────────────────

export function useArtifacts(scope: {
  setId?: string | null;
  search?: string;
  tags?: string;
  type?: string;
  starred?: boolean;
}) {
  return useQuery<ArtifactSummary[]>({
    queryKey: archiveKeys.artifacts(scope),
    queryFn: () =>
      api.get<ArtifactSummary[]>("/api/archive/artifacts", {
        params: {
          setId: scope.setId ?? undefined,
          search: scope.search || undefined,
          tags: scope.tags || undefined,
          type: scope.type || undefined,
          starred: scope.starred ? "true" : undefined,
        },
      }),
  });
}

export function useArtifactDetail(id: string | null) {
  return useQuery<ArtifactDetail>({
    queryKey: archiveKeys.artifact(id ?? "none"),
    queryFn: () => api.get<ArtifactDetail>("/api/archive/artifacts", { params: { id: id! } }),
    enabled: Boolean(id),
  });
}

// ── Artifacts: mutations ─────────────────────────────────────────────────────

export function useCreateArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateArtifactPayload) =>
      api.post<ArtifactDetail>("/api/archive/artifacts", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

export function useUpdateArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateArtifactPayload }) =>
      api.put<ArtifactSummary>("/api/archive/artifacts", payload, { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

export function useDeleteArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete("/api/archive/artifacts", { params: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

// ── Versions: mutations ──────────────────────────────────────────────────────

/** Commit a new immutable version pointing at an already-uploaded contentKey. */
export function useCommitVersion(artifactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { contentKey: string; changeSummary?: string | null; byteSize?: number | null }) =>
      api.post<VersionDetail>(`/api/archive/artifacts/${artifactId}/versions`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

/** Restore an older version → appends a new head version (immutable history). */
export function useRestoreVersion(artifactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionNumber: number) =>
      api.put<VersionDetail>(`/api/archive/artifacts/${artifactId}/versions`, { versionNumber }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

// ── Text content (TEXT artifacts) ────────────────────────────────────────────

export function useTextContent(artifactId: string, versionNumber?: number, enabled = true) {
  const params: Record<string, string> = {};
  if (versionNumber !== undefined) params.versionNumber = String(versionNumber);
  return useQuery<Record<string, unknown> | null>({
    queryKey: ["archive", "content", artifactId, versionNumber ?? "head"],
    queryFn: () =>
      api.get<Record<string, unknown> | null>(
        `/api/archive/artifacts/${artifactId}/content`,
        { params }
      ),
    staleTime: 60_000,
    enabled,
  });
}

export function useSaveTextContent(artifactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { doc: Record<string, unknown>; changeSummary?: string | null }) =>
      api.put<VersionDetail>(`/api/archive/artifacts/${artifactId}/content`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
  });
}

// ── Storage: download ────────────────────────────────────────────────────────

/**
 * Fetch a short-lived presigned download URL for a version's contentKey.
 * Plain async fn (not a hook) — call it on click, then open the URL.
 */
export async function getDownloadUrl(contentKey: string): Promise<string> {
  const res = await api.get<{ downloadUrl: string; contentKey: string }>(
    "/api/storage/download",
    { params: { contentKey } }
  );
  return res.downloadUrl;
}

// ── Stars ────────────────────────────────────────────────────────────────────

/** All starred artifacts + sets for the current user. */
export function useStarred() {
  return useQuery<StarredLists>({
    queryKey: archiveKeys.stars(),
    queryFn: () => api.get<StarredLists>("/api/archive/stars"),
  });
}

/** Star an artifact or set. */
export function useStar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetType, targetId }: { targetType: StarTargetType; targetId: string }) =>
      api.post<StarSummary>("/api/archive/stars", { targetType, targetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

/** Unstar an artifact or set. */
export function useUnstar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetType, targetId }: { targetType: StarTargetType; targetId: string }) =>
      api.delete("/api/archive/stars", { params: { targetType, targetId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

// ── Trash ────────────────────────────────────────────────────────────────────

export function useTrash() {
  return useQuery<TrashItem[]>({
    queryKey: archiveKeys.trash(),
    queryFn: () => api.get<TrashItem[]>("/api/archive/trash"),
  });
}

export function useRestoreTrashItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: TrashItemKind; id: string }) =>
      api.put("/api/archive/trash", { kind, id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

export function usePermanentDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: TrashItemKind; id: string }) =>
      api.delete("/api/archive/trash", { params: { kind, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
  });
}

// ── Storage usage ────────────────────────────────────────────────────────────

export function useStorageUsage() {
  return useQuery<StorageUsage>({
    queryKey: archiveKeys.storage(),
    queryFn: () => api.get<StorageUsage>("/api/storage/usage"),
    staleTime: 30_000, // re-fetch every 30s at most
  });
}

// ── Sharing (V2 Slice 1) ─────────────────────────────────────────────────────

export interface ShareGrant {
  id: string;
  artifactId: string;
  ownerId: string;
  granteeId: string;
  granteeName: string;
  granteeEmail: string;
  createdAt: Date;
}

export interface SharedArtifactSummary {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  type: string;
  ownerId: string;
  ownerName: string;
  setId: string | null;
  createdAt: Date;
  updatedAt: Date;
  sharedAt: Date;
}

export interface OutgoingShare {
  shareId: string;
  artifactId: string;
  artifactTitle: string;
  artifactType: string;
  granteeId: string;
  granteeName: string;
  granteeEmail: string;
  sharedAt: Date;
}

export function useShareGrants(artifactId: string, enabled = true) {
  return useQuery<ShareGrant[]>({
    queryKey: ["archive", "shares", artifactId],
    queryFn: () => api.get<ShareGrant[]>(`/api/archive/artifacts/${artifactId}/share`),
    enabled,
    staleTime: 30_000,
  });
}

export function useSharedWithMe() {
  return useQuery<SharedArtifactSummary[]>({
    queryKey: ["archive", "shared-with-me"],
    queryFn: () => api.get<SharedArtifactSummary[]>("/api/archive/shared"),
    staleTime: 30_000,
  });
}

export function useMyShares() {
  return useQuery<OutgoingShare[]>({
    queryKey: ["archive", "my-shares"],
    queryFn: () => api.get<OutgoingShare[]>("/api/archive/my-shares"),
    staleTime: 30_000,
  });
}

export function useShareArtifact(artifactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (granteeEmail: string) =>
      api.post<ShareGrant>(`/api/archive/artifacts/${artifactId}/share`, { granteeEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive", "shares", artifactId] });
      qc.invalidateQueries({ queryKey: ["archive", "my-shares"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useRevokeShare(artifactId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (granteeId: string) =>
      api.deleteWithBody(`/api/archive/artifacts/${artifactId}/share`, { granteeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive", "shares", artifactId] });
      qc.invalidateQueries({ queryKey: ["archive", "my-shares"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

export function useShareSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, granteeEmail }: { setId: string; granteeEmail: string }) =>
      api.post<{ sharedCount: number }>(`/api/archive/sets/${setId}/share`, { granteeEmail }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive", "my-shares"] });
      qc.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}

// ── Move ─────────────────────────────────────────────────────────────────────

export function useMoveArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ artifactId, targetSetId }: { artifactId: string; targetSetId: string }) =>
      api.post(`/api/archive/artifacts/${artifactId}/move`, { setId: targetSetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archive"] }),
  });
}

// ── File upload (presigned PUT via storage route) ─────────────────────────────

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ artifactId, file }: { artifactId: string; file: File }) => {
      // 1. Request an upload ticket (presigned PUT URL + contentKey)
      const ticket = await api.post<{ uploadUrl: string; contentKey: string }>(
        "/api/storage/upload",
        { filename: file.name, contentType: file.type, byteSize: file.size }
      );
      // 2. PUT the file directly to R2
      await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      // 3. Commit the version with the contentKey
      return api.post<{ version: unknown }>(
        `/api/archive/artifacts/${artifactId}/versions`,
        { contentKey: ticket.contentKey, byteSize: file.size }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archive"] });
      qc.invalidateQueries({ queryKey: ["storage"] });
    },
  });
}
