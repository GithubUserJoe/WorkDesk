"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, ChevronRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useSets, useMoveArtifact } from "@/modules/archive/hooks";
import type { SetSummary } from "@/modules/archive/types";

interface Props {
  artifactId: string;
  currentSetId: string | null;
  artifactTitle: string;
  onClose: () => void;
  onMoved?: () => void;
}

export function MoveModal({ artifactId, currentSetId, artifactTitle, onClose, onMoved }: Props) {
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const { data: rootSetsPage } = useSets("root");
  const rootSets = rootSetsPage?.items ?? [];
  const move = useMoveArtifact();

  function handleMove() {
    if (!selectedSetId || selectedSetId === currentSetId) return;
    move.mutate(
      { artifactId, targetSetId: selectedSetId },
      { onSuccess: () => { onMoved?.(); onClose(); } }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-sm bg-surface-elevated border border-border-default rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text-primary">Move artifact</p>
            <p className="text-[11px] text-text-secondary truncate">{artifactTitle}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-container-high text-text-secondary transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-72 p-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-secondary px-2 mb-1">Select destination Set</p>
          {rootSets.map(set => (
            <SetNode
              key={set.id}
              set={set}
              depth={0}
              currentSetId={currentSetId}
              selectedSetId={selectedSetId}
              onSelect={setSelectedSetId}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={onClose}
            className="h-7 px-3 text-[12px] text-text-secondary hover:text-text-primary border border-border-default rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={!selectedSetId || selectedSetId === currentSetId || move.isPending}
            className="h-7 px-3 text-[12px] font-medium bg-primary text-on-primary rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-1.5"
          >
            {move.isPending && <Loader2 size={11} className="animate-spin" />}
            Move here
          </button>
        </div>
      </div>
    </div>
  );
}

function SetNode({
  set, depth, currentSetId, selectedSetId, onSelect,
}: {
  set: SetSummary;
  depth: number;
  currentSetId: string | null;
  selectedSetId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: children = [] } = useQuery<SetSummary[]>({
    queryKey: ["archive", "sets", set.id],
    queryFn: () => api.get<SetSummary[]>("/api/archive/sets", { params: { parentId: set.id } }),
    enabled: open,
  });
  const isCurrent = set.id === currentSetId;
  const isSelected = set.id === selectedSetId;

  return (
    <div>
      <button
        onClick={() => { if (!isCurrent) onSelect(set.id); setOpen(v => !v); }}
        disabled={isCurrent}
        className={cn(
          "w-full flex items-center gap-1.5 h-8 rounded text-[12px] px-2 transition-colors text-left",
          isCurrent && "opacity-40 cursor-not-allowed",
          isSelected && !isCurrent && "bg-primary/15 text-primary",
          !isSelected && !isCurrent && "text-text-secondary hover:bg-surface-container-high hover:text-text-primary",
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <ChevronRight size={12} className={cn("shrink-0 transition-transform", open && "rotate-90")} />
        <FolderOpen size={13} className="shrink-0" />
        <span className="truncate">{set.name}</span>
        {isCurrent && <span className="ml-auto text-[10px]">current</span>}
      </button>

      {open && children.map(child => (
        <SetNode
          key={child.id}
          set={child}
          depth={depth + 1}
          currentSetId={currentSetId}
          selectedSetId={selectedSetId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
