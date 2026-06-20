"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderOpen, Folder, MoreHorizontal, Plus, FileText, Loader2, BookOpen, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useSets, useCreateSet, useUpdateSet, useDeleteSet } from "@/modules/archive/hooks";
import { usePublishSetToLibrary } from "@/modules/library/hooks";
import { ShareSetDialog } from "@/components/archive/share-set-dialog";
import type { SetSummary, ArtifactSummary } from "@/modules/archive/types";

// ─────────────────────────────────────────────────────────────────────────────
// SetTree — collapsible sidebar tree of Sets and their Artifacts.
//
// Each Set lazily loads its children + artifacts when expanded.
// Supports inline create (root + per-set), inline rename, and per-set delete.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  selectedArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  activeSetId: string | null;
  onSelectSet: (id: string | null) => void;
}

export function SetTree({ selectedArtifactId, onSelectArtifact, activeSetId, onSelectSet }: Props) {
  const { data: rootSets = [], isLoading } = useSets("root");
  const createSet = useCreateSet();
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [rootName, setRootName] = useState("");

  async function handleRootCreate() {
    const name = rootName.trim();
    if (!name) { setCreatingRoot(false); return; }
    await createSet.mutateAsync({ name, parentId: null });
    setRootName("");
    setCreatingRoot(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Sets</span>
        <button
          onClick={() => setCreatingRoot(true)}
          className="w-5 h-5 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-surface-container-high transition-colors"
          title="New root Set"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* All artifacts (root) shortcut */}
      <button
        onClick={() => onSelectSet(null)}
        className={cn(
          "flex items-center gap-2 mx-2 px-2 h-7 rounded text-[12px] transition-colors",
          activeSetId === null
            ? "bg-primary/10 text-primary"
            : "text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
        )}
      >
        <Folder size={13} className="shrink-0" />
        <span className="truncate">All artifacts</span>
      </button>

      {/* Root-level inline create */}
      {creatingRoot && (
        <div className="mx-2 mt-1 px-2">
          <input
            autoFocus
            value={rootName}
            onChange={e => setRootName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleRootCreate();
              if (e.key === "Escape") { setCreatingRoot(false); setRootName(""); }
            }}
            onBlur={handleRootCreate}
            placeholder="Set name…"
            className="w-full h-6 px-2 text-[12px] bg-surface-container border border-primary rounded outline-none text-text-primary placeholder:text-text-secondary"
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto mt-1 pb-4">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={14} className="animate-spin text-text-secondary" />
          </div>
        )}
        {!isLoading && rootSets.map(set => (
          <SetNode
            key={set.id}
            set={set}
            depth={0}
            activeSetId={activeSetId}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={onSelectArtifact}
            onSelectSet={onSelectSet}
          />
        ))}
      </div>
    </div>
  );
}

// ── SetNode ───────────────────────────────────────────────────────────────────

function SetNode({
  set, depth, activeSetId, selectedArtifactId, onSelectArtifact, onSelectSet,
}: {
  set: SetSummary;
  depth: number;
  activeSetId: string | null;
  selectedArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  onSelectSet: (id: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(set.name);
  const [creatingChild, setCreatingChild] = useState(false);
  const [childName, setChildName] = useState("");

  const updateSet = useUpdateSet();
  const deleteSet = useDeleteSet();
  const createSet = useCreateSet();
  const publishSet = usePublishSetToLibrary();
  const [publishStatus, setPublishStatus] = useState<"idle" | "loading" | "done">("idle");
  const [shareOpen, setShareOpen] = useState(false);

  // Lazy-load contents when expanded
  const { data: childSets = [], isLoading: setsLoading } = useQuery<SetSummary[]>({
    queryKey: ["archive", "sets", set.id],
    queryFn: () => api.get<SetSummary[]>("/api/archive/sets", { params: { parentId: set.id } }),
    enabled: expanded,
  });
  const { data: childArtifacts = [], isLoading: artifactsLoading } = useQuery<ArtifactSummary[]>({
    queryKey: ["archive", "artifacts", { setId: set.id }],
    queryFn: () => api.get<ArtifactSummary[]>("/api/archive/artifacts", { params: { setId: set.id } }),
    enabled: expanded,
  });

  const isActive = activeSetId === set.id;
  const loading = setsLoading || artifactsLoading;

  async function handleRename() {
    const name = renameVal.trim();
    if (name && name !== set.name) await updateSet.mutateAsync({ id: set.id, payload: { name } });
    setRenaming(false);
  }

  async function handleDelete() {
    setMenuOpen(false);
    await deleteSet.mutateAsync(set.id);
  }

  async function handlePublishToLibrary() {
    setMenuOpen(false);
    setPublishStatus("loading");
    try {
      await publishSet.mutateAsync(set.id);
      setPublishStatus("done");
      setTimeout(() => setPublishStatus("idle"), 3000);
    } catch {
      setPublishStatus("idle");
    }
  }

  async function handleChildCreate() {
    const name = childName.trim();
    if (!name) { setCreatingChild(false); return; }
    await createSet.mutateAsync({ name, parentId: set.id });
    setChildName("");
    setCreatingChild(false);
    setExpanded(true);
  }

  const pl = 8 + depth * 12;

  return (
    <div>
      {/* Set row */}
      <div
        className={cn(
          "group flex items-center h-7 pr-2 rounded mx-1 transition-colors cursor-pointer",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
        )}
        style={{ paddingLeft: `${pl}px` }}
        onClick={() => { onSelectSet(set.id); setExpanded(v => !v); }}
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 transition-transform mr-1", expanded && "rotate-90")}
        />
        {expanded ? <FolderOpen size={13} className="shrink-0 mr-1.5" /> : <Folder size={13} className="shrink-0 mr-1.5" />}

        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.stopPropagation(); handleRename(); }
              if (e.key === "Escape") { setRenaming(false); setRenameVal(set.name); }
            }}
            onBlur={handleRename}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 h-5 px-1 text-[12px] bg-surface-container border border-primary rounded outline-none text-text-primary"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-[12px] flex items-center gap-1">
            {set.name}
            {publishStatus === "loading" && <Loader2 size={9} className="animate-spin text-text-secondary shrink-0" />}
            {publishStatus === "done" && <BookOpen size={9} className="text-primary shrink-0" />}
          </span>
        )}

        {/* Per-set actions */}
        {!renaming && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button
              onClick={e => { e.stopPropagation(); setCreatingChild(true); setExpanded(true); }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-container text-text-secondary hover:text-text-primary transition-colors"
              title="New child Set"
            >
              <Plus size={11} />
            </button>
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-container text-text-secondary hover:text-text-primary transition-colors"
              >
                <MoreHorizontal size={11} />
              </button>
              {menuOpen && (
                <SetMenu
                  onRename={() => { setRenaming(true); setMenuOpen(false); }}
                  onDelete={handleDelete}
                  onPublishToLibrary={handlePublishToLibrary}
                  onShare={() => { setShareOpen(true); setMenuOpen(false); }}
                  onClose={() => setMenuOpen(false)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Share Set Dialog */}
      <ShareSetDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        setId={set.id}
        setName={set.name}
      />

      {/* Expanded contents */}
      {expanded && (
        <div>
          {creatingChild && (
            <div style={{ paddingLeft: `${pl + 24}px` }} className="pr-2 py-0.5">
              <input
                autoFocus
                value={childName}
                onChange={e => setChildName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleChildCreate();
                  if (e.key === "Escape") { setCreatingChild(false); setChildName(""); }
                }}
                onBlur={handleChildCreate}
                placeholder="Set name…"
                className="w-full h-6 px-2 text-[12px] bg-surface-container border border-primary rounded outline-none text-text-primary placeholder:text-text-secondary"
              />
            </div>
          )}

          {loading && (
            <div style={{ paddingLeft: `${pl + 24}px` }} className="py-1">
              <Loader2 size={11} className="animate-spin text-text-secondary" />
            </div>
          )}

          {/* Child sets */}
          {childSets.map(child => (
            <SetNode
              key={child.id}
              set={child}
              depth={depth + 1}
              activeSetId={activeSetId}
              selectedArtifactId={selectedArtifactId}
              onSelectArtifact={onSelectArtifact}
              onSelectSet={onSelectSet}
            />
          ))}

          {/* Artifacts in this set */}
          {childArtifacts.map(a => (
            <ArtifactLeaf
              key={a.id}
              artifact={a}
              depth={depth + 1}
              selected={selectedArtifactId === a.id}
              onClick={() => onSelectArtifact(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ArtifactLeaf ──────────────────────────────────────────────────────────────

function ArtifactLeaf({
  artifact, depth, selected, onClick,
}: {
  artifact: ArtifactSummary;
  depth: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 w-full h-6 pr-2 rounded mx-1 text-[11px] transition-colors truncate",
        selected
          ? "bg-primary/10 text-primary"
          : "text-text-secondary hover:bg-surface-container-high hover:text-text-primary"
      )}
      style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
    >
      <FileText size={11} className="shrink-0" />
      <span className="truncate">{artifact.title}</span>
    </button>
  );
}

// ── SetMenu ───────────────────────────────────────────────────────────────────

function SetMenu({
  onRename, onDelete, onPublishToLibrary, onShare, onClose,
}: {
  onRename: () => void;
  onDelete: () => void;
  onPublishToLibrary: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-6 z-50 w-48 bg-surface-elevated border border-border-default rounded-md shadow-lg py-1 overflow-hidden">
        <button
          onClick={onRename}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-container-high hover:text-text-primary transition-colors"
        >
          Rename
        </button>
        <button
          onClick={onShare}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-container-high hover:text-text-primary transition-colors"
        >
          <Share2 size={11} />
          Share with member
        </button>
        <button
          onClick={onPublishToLibrary}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-container-high hover:text-text-primary transition-colors"
        >
          <BookOpen size={11} />
          Publish to Library
        </button>
        <div className="my-1 border-t border-border-default" />
        <button
          onClick={onDelete}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-status-danger hover:bg-surface-container-high transition-colors"
        >
          Delete
        </button>
      </div>
    </>
  );
}
