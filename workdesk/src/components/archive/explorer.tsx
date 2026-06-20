"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Confirm } from "@/components/ui/confirm";
import { SetDialog } from "./set-dialog";
import { ArtifactDialog } from "./artifact-dialog";
import { ApiError } from "@/lib/api-client";
import {
  useSets,
  useArtifacts,
  useDeleteSet,
  useDeleteArtifact,
  useStar,
  useUnstar,
  useStarred,
} from "@/modules/archive/hooks";
import type { SetSummary, ArtifactSummary } from "@/modules/archive/types";
import type { ArtifactType } from "@/lib/enums";

// ─────────────────────────────────────────────────────────────────────────────
// Archive Explorer (Slice 1 + Slice 3 additions).
//
// Slice 3 adds: debounced search bar, type/starred filter chips, star toggle
// on every row, and a starred-only view mode.
// ─────────────────────────────────────────────────────────────────────────────

interface Crumb {
  id: string | null;
  name: string;
}

type ViewMode = "explorer" | "list";

const ARTIFACT_TYPES: ArtifactType[] = ["TEXT", "PDF", "DOCX", "PPTX", "IMAGE", "ZIP", "OTHER"];

// ── Icons ─────────────────────────────────────────────────────────────────────

function SetIcon() {
  return (
    <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg className="h-5 w-5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-colors ${filled ? "fill-warning stroke-warning" : "fill-none stroke-text-secondary hover:stroke-warning"}`}
      viewBox="0 0 24 24"
      strokeWidth="1.8"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="h-4 w-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Main component ────────────────────────────────────────────────────────────

export function Explorer({ initialStarred = false }: { initialStarred?: boolean }) {
  const router = useRouter();

  // Navigation
  const [path, setPath] = useState<Crumb[]>([{ id: null, name: "Archive" }]);
  const current = path[path.length - 1];
  const parentId = current.id;
  const setsParent = parentId ?? "root";

  // View
  const [view, setView] = useState<ViewMode>("explorer");

  // Search + filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ArtifactType | "">("");
  const [starredOnly, setStarredOnly] = useState(initialStarred);
  const debouncedSearch = useDebounced(search);
  const searchRef = useRef<HTMLInputElement>(null);

  // Dialog state
  const [setDialog, setSetDialog] = useState<{ open: boolean; editing?: SetSummary | null }>({ open: false });
  const [artifactDialog, setArtifactDialog] = useState<{ open: boolean; editing?: ArtifactSummary | null }>({ open: false });
  const [deleteSetTarget, setDeleteSetTarget] = useState<SetSummary | null>(null);
  const [deleteArtifactTarget, setDeleteArtifactTarget] = useState<ArtifactSummary | null>(null);

  // Queries
  const setsQuery = useSets(setsParent);
  const artifactsQuery = useArtifacts({
    setId: setsParent,
    search: debouncedSearch || undefined,
    type: typeFilter || undefined,
    starred: starredOnly || undefined,
  });
  const starredQuery = useStarred();
  const deleteSet = useDeleteSet();
  const deleteArtifact = useDeleteArtifact();
  const star = useStar();
  const unstar = useUnstar();

  // Starred ID sets for instant toggle feedback
  const starredArtifactIds = new Set(starredQuery.data?.artifacts.map((a) => a.id) ?? []);
  const starredSetIds = new Set(starredQuery.data?.sets.map((s) => s.id) ?? []);

  // When filters are active, sets aren't scoped by set (show all at root level in list)
  const hasFilters = Boolean(debouncedSearch || typeFilter || starredOnly);

  function openSet(s: SetSummary) {
    if (hasFilters) return; // don't navigate into Sets while searching
    setPath((p) => [...p, { id: s.id, name: s.name }]);
  }
  function jumpTo(index: number) {
    setPath((p) => p.slice(0, index + 1));
  }

  function toggleStar(targetType: "artifact" | "set", targetId: string, currently: boolean) {
    if (currently) {
      unstar.mutate({ targetType, targetId });
    } else {
      star.mutate({ targetType, targetId });
    }
  }

  function clearFilters() {
    setSearch("");
    setTypeFilter("");
    setStarredOnly(false);
  }

  const loading = setsQuery.isLoading || artifactsQuery.isLoading;
  const error = setsQuery.error || artifactsQuery.error;
  const sets = hasFilters ? [] : (setsQuery.data?.items ?? []); // hide Sets while searching
  const artifacts = artifactsQuery.data?.items ?? [];
  const isEmpty = !loading && !error && sets.length === 0 && artifacts.length === 0;

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">Archive</h1>
          {/* Breadcrumb — hidden while filters are active */}
          {!hasFilters && (
            <nav className="mt-1 flex flex-wrap items-center gap-1 text-sm text-text-secondary">
              {path.map((c, i) => (
                <span key={`${c.id ?? "root"}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-text-secondary/50">/</span>}
                  <button
                    className={
                      "rounded px-1 hover:text-text-primary " +
                      (i === path.length - 1 ? "text-text-primary" : "")
                    }
                    onClick={() => jumpTo(i)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
          )}
          {hasFilters && (
            <p className="mt-1 text-sm text-text-secondary">
              Searching across all Sets ·{" "}
              <button className="text-primary hover:underline" onClick={clearFilters}>
                clear filters
              </button>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* View toggle */}
          <div className="flex overflow-hidden rounded-md border border-border-default">
            <button
              onClick={() => setView("explorer")}
              className={"px-2.5 py-1.5 text-xs " + (view === "explorer" ? "bg-surface-container-high text-primary" : "text-text-secondary hover:text-text-primary")}
            >
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={"px-2.5 py-1.5 text-xs " + (view === "list" ? "bg-surface-container-high text-primary" : "text-text-secondary hover:text-text-primary")}
            >
              List
            </button>
          </div>
          <Button variant="secondary" onClick={() => setSetDialog({ open: true })}>
            New Set
          </Button>
          <Button onClick={() => setArtifactDialog({ open: true })}>New artifact</Button>
        </div>
      </div>

      {/* Search bar + filter chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <SearchIcon />
          </span>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artifacts…"
            className="w-full rounded-md border border-border-default bg-surface-container py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-primary focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
            >
              ✕
            </button>
          )}
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ArtifactType | "")}
          className="rounded-md border border-border-default bg-surface-container px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
        >
          <option value="">All types</option>
          {ARTIFACT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Starred toggle chip */}
        <button
          onClick={() => setStarredOnly((v) => !v)}
          className={
            "flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors " +
            (starredOnly
              ? "border-warning/60 bg-warning/10 text-warning"
              : "border-border-default bg-surface-container text-text-secondary hover:text-text-primary")
          }
        >
          <StarIcon filled={starredOnly} />
          Starred
        </button>
      </div>

      {/* Body */}
      <div className="mt-6">
        {loading && <LoadingState />}
        {error && (
          <ErrorState
            message={error instanceof ApiError ? error.message : "Failed to load the archive."}
            onRetry={() => {
              setsQuery.refetch();
              artifactsQuery.refetch();
            }}
          />
        )}
        {isEmpty && !loading && !error && (
          <EmptyState
            title={hasFilters ? "No results" : "This Set is empty"}
            hint={
              hasFilters
                ? "Try different search terms or clear the filters."
                : "Create a Set to organize your work, or add an artifact."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setArtifactDialog({ open: true })}>New artifact</Button>
              )
            }
          />
        )}

        {!loading && !error && !isEmpty && (
          <div
            className={
              view === "explorer"
                ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "divide-y divide-border-default rounded-lg border border-border-default"
            }
          >
            {/* Sets (hidden while filters active) */}
            {sets.map((s) => (
              <Row
                key={s.id}
                view={view}
                icon={<SetIcon />}
                title={s.name}
                subtitle="Set"
                starred={starredSetIds.has(s.id)}
                onStar={() => toggleStar("set", s.id, starredSetIds.has(s.id))}
                onOpen={() => openSet(s)}
                onEdit={() => setSetDialog({ open: true, editing: s })}
                editLabel="Rename"
                onDelete={() => setDeleteSetTarget(s)}
              />
            ))}
            {/* Artifacts */}
            {artifacts.map((a) => (
              <Row
                key={a.id}
                view={view}
                icon={<FileIcon />}
                title={a.title}
                subtitle={
                  a.type +
                  (a.visibility === "PUBLIC" ? " · 📖 Published" : a.visibility === "SHARED" ? " · Shared" : "") +
                  (a.tags.length ? ` · ${a.tags.join(", ")}` : "")
                }
                starred={starredArtifactIds.has(a.id)}
                onStar={() => toggleStar("artifact", a.id, starredArtifactIds.has(a.id))}
                onOpen={() => router.push(`/archive/${a.id}`)}
                onEdit={() => setArtifactDialog({ open: true, editing: a })}
                onDelete={() => setDeleteArtifactTarget(a)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SetDialog
        open={setDialog.open}
        editing={setDialog.editing}
        parentId={parentId}
        onClose={() => setSetDialog({ open: false })}
      />
      <ArtifactDialog
        open={artifactDialog.open}
        editing={artifactDialog.editing}
        setId={parentId}
        onClose={() => setArtifactDialog({ open: false })}
      />
      <Confirm
        open={Boolean(deleteSetTarget)}
        onClose={() => setDeleteSetTarget(null)}
        title="Delete Set"
        message={`Delete "${deleteSetTarget?.name}" and everything inside it? Items move to Trash (restorable for 30 days).`}
        onConfirm={async () => {
          if (deleteSetTarget) await deleteSet.mutateAsync(deleteSetTarget.id);
        }}
      />
      <Confirm
        open={Boolean(deleteArtifactTarget)}
        onClose={() => setDeleteArtifactTarget(null)}
        title="Delete artifact"
        message={`Delete "${deleteArtifactTarget?.title}"? It moves to Trash (restorable for 30 days).`}
        onConfirm={async () => {
          if (deleteArtifactTarget) await deleteArtifact.mutateAsync(deleteArtifactTarget.id);
        }}
      />
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({
  view,
  icon,
  title,
  subtitle,
  starred,
  onStar,
  onOpen,
  onEdit,
  editLabel = "Edit",
  onDelete,
}: {
  view: ViewMode;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  starred: boolean;
  onStar: () => void;
  onOpen?: () => void;
  onEdit: () => void;
  editLabel?: string;
  onDelete: () => void;
}) {
  const base =
    view === "explorer"
      ? "group flex items-start gap-3 rounded-lg border border-border-default bg-surface-container p-4 hover:border-primary/50"
      : "group flex items-center gap-3 px-4 py-3 hover:bg-surface-container";

  return (
    <div
      className={base + (onOpen ? " cursor-pointer" : "")}
      onDoubleClick={onOpen}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        <p className="truncate text-xs text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* Star — always visible but subtle when unstarred */}
        <button
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          className="rounded p-1 hover:bg-surface-container-high"
          title={starred ? "Unstar" : "Star"}
        >
          <StarIcon filled={starred} />
        </button>
        {/* Edit/Delete — appear on hover */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
          >
            {editLabel}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-danger/10 hover:text-danger"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
