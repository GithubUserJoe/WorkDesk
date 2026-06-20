"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { LayoutGrid, List, Plus, Trash2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SetTree } from "@/components/archive/set-tree";
import { ArtifactGrid } from "@/components/archive/artifact-grid";
import { ArtifactDetailsPanel } from "@/components/archive/artifact-details-panel";
import { NewArtifactModal } from "@/components/archive/new-artifact-modal";
import { SetDialog } from "@/components/archive/set-dialog";
import { useArtifacts } from "@/modules/archive/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// Archive — three-panel layout.
//
//   [220px SetTree] | [flex-1 ArtifactGrid] | [280px ArtifactDetailsPanel?]
//
// URL: /archive?set=<id> auto-selects the set on mount (links from elsewhere),
// then replaced with /archive so the URL stays clean.
// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

export default function ArchivePage() {
  return (
    <Suspense>
      <ArchiveInner />
    </Suspense>
  );
}

function ArchiveInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [newArtifactOpen, setNewArtifactOpen] = useState(false);
  const [newSetOpen, setNewSetOpen] = useState(false);
  const [search, setSearch] = useState("");

  // ?set=<id> deep-link support
  useEffect(() => {
    const setId = searchParams.get("set");
    if (setId) {
      setActiveSetId(setId);
      router.replace("/archive");
    }
  }, [searchParams, router]);

  // Clear selection when switching set
  function handleSelectSet(id: string | null) {
    setActiveSetId(id);
    setSelectedArtifactId(null);
  }

  // Toggle selection (click same artifact deselects)
  function handleSelectArtifact(id: string) {
    setSelectedArtifactId(prev => prev === id ? null : id);
  }

  const { data: artifactsPage, isLoading } = useArtifacts({
    setId: activeSetId,
    search: search.trim() || undefined,
  });
  const artifacts = artifactsPage?.items ?? [];

  const filtered = search.trim()
    ? artifacts.filter(a => a.title.toLowerCase().includes(search.toLowerCase()))
    : artifacts;

  return (
    <div className="flex h-full overflow-hidden bg-surface-primary">

      {/* Left: Set Tree */}
      <div className="w-[220px] shrink-0 border-r border-border-default bg-surface-secondary overflow-hidden flex flex-col">
        <SetTree
          selectedArtifactId={selectedArtifactId}
          onSelectArtifact={handleSelectArtifact}
          activeSetId={activeSetId}
          onSelectSet={handleSelectSet}
        />

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-border-default p-2 space-y-1">
          <button
            onClick={() => router.push("/archive/trash")}
            className="flex items-center gap-2 w-full px-2 h-7 rounded text-[12px] text-text-secondary hover:bg-surface-container-high hover:text-text-primary transition-colors"
          >
            <Trash2 size={13} />
            Trash
          </button>
        </div>
      </div>

      {/* Center: Artifact Grid */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-default shrink-0">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search artifacts…"
              className="w-full h-7 pl-7 pr-6 text-[12px] bg-surface-container border border-border-default rounded outline-none text-text-primary placeholder:text-text-secondary focus:border-primary transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-center border border-border-default rounded overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "w-7 h-7 flex items-center justify-center transition-colors",
                view === "grid" ? "bg-surface-container-high text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "w-7 h-7 flex items-center justify-center transition-colors",
                view === "list" ? "bg-surface-container-high text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <List size={13} />
            </button>
          </div>

          {/* New Set */}
          <button
            onClick={() => setNewSetOpen(true)}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[12px] border border-border-default rounded text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
          >
            <Plus size={12} />
            New Set
          </button>

          {/* New Artifact */}
          <button
            onClick={() => setNewArtifactOpen(true)}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[12px] bg-primary text-on-primary rounded hover:opacity-90 transition-opacity"
          >
            <Plus size={12} />
            New Artifact
          </button>
        </div>

        {/* Grid area */}
        <div className="flex-1 flex overflow-hidden">
          <ArtifactGrid
            artifacts={filtered}
            isLoading={isLoading}
            selectedArtifactId={selectedArtifactId}
            onSelect={handleSelectArtifact}
            view={view}
            setId={activeSetId}
            onNewArtifact={() => setNewArtifactOpen(true)}
          />
        </div>
      </div>

      {/* Right: Details panel (conditional) */}
      {selectedArtifactId && (
        <ArtifactDetailsPanel
          artifactId={selectedArtifactId}
          onClose={() => setSelectedArtifactId(null)}
        />
      )}

      {/* Modals */}
      {newArtifactOpen && (
        <NewArtifactModal
          setId={activeSetId}
          onClose={() => setNewArtifactOpen(false)}
        />
      )}
      <SetDialog
        open={newSetOpen}
        editing={null}
        parentId={activeSetId}
        onClose={() => setNewSetOpen(false)}
      />
    </div>
  );
}
