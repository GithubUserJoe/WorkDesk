"use client";

import { useCallback, useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  SelectionMode,
  type NodeMouseHandler,
  type Node,
  type Edge,
  type ReactFlowInstance,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphData } from "@/modules/relationships/hooks";
import { buildFlowGraph } from "@/components/graph/layout";
import { MemberNode, SetNode, ArtifactNode, NODE_COLORS } from "@/components/graph/graph-nodes";
import { FloatingCanvas } from "@/components/graph/floating-canvas";
import { LoadingState, ErrorState } from "@/components/ui/states";
import type { GraphNode } from "@/modules/relationships/types";

// ─────────────────────────────────────────────────────────────────────────────
// Custom node type registry
// ─────────────────────────────────────────────────────────────────────────────

const nodeTypes = {
  memberNode: MemberNode,
  setNode: SetNode,
  artifactNode: ArtifactNode,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hover tooltip
// ─────────────────────────────────────────────────────────────────────────────

function Tooltip({ node, x, y }: { node: GraphNode; x: number; y: number }) {
  const tags = node.tags ?? [];
  return (
    <div
      style={{
        position: "fixed",
        left: x + 16,
        top: y - 8,
        zIndex: 9999,
        pointerEvents: "none",
        background: "#1c2128",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "8px 12px",
        maxWidth: 220,
        boxShadow: "0 8px 24px #00000088",
        animation: "tooltipIn 0.15s ease",
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3", marginBottom: 2, fontFamily: "Inter, sans-serif" }}>
        {node.label}
      </p>
      {node.artifactType && (
        <p style={{ fontSize: 10, color: "#8b949e", fontFamily: "Inter, sans-serif", marginBottom: 4 }}>
          {node.artifactType}{node.ownerName ? ` · ${node.ownerName}` : ""}
        </p>
      )}
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {tags.map(t => (
            <span key={t} style={{
              fontSize: 9, background: "#21262d", color: "#58a6ff",
              border: "1px solid #388bfd44", borderRadius: 4, padding: "1px 5px",
              fontFamily: "Inter, sans-serif",
            }}>
              {t}
            </span>
          ))}
        </div>
      )}
      {node.visibility === "PUBLIC" && (
        <p style={{ fontSize: 9, color: "#79c0ff", marginTop: 4, fontFamily: "Inter, sans-serif" }}>
          Public archive
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Side panel — shows on single click
// ─────────────────────────────────────────────────────────────────────────────

function SidePanel({
  node,
  onClose,
  onOpen,
  onDownload,
}: {
  node: GraphNode;
  onClose: () => void;
  onOpen: () => void;
  onDownload?: () => void;
}) {
  const isArtifact = node.type === "artifact";
  const tags = node.tags ?? [];

  return (
    <div style={{
      position: "absolute",
      top: 0,
      right: 0,
      width: 280,
      height: "100%",
      background: "#161b22",
      borderLeft: "1px solid #30363d",
      zIndex: 10,
      display: "flex",
      flexDirection: "column",
      animation: "panelSlideIn 0.2s ease",
      fontFamily: "Inter, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
            {node.type === "member" ? "Member" : node.type === "set" ? "Set" : node.type === "subset" ? "Subset" : node.artifactType}
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", lineHeight: 1.4 }}>{node.label}</p>
        </div>
        <button onClick={onClose} style={{ color: "#8b949e", background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: 16, overflow: "auto" }}>
        {node.ownerName && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Owner</p>
            <p style={{ fontSize: 12, color: "#e6edf3" }}>{node.ownerName}</p>
          </div>
        )}
        {node.visibility && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Visibility</p>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5,
              background: node.visibility === "PUBLIC" ? "#1f6feb22" : "#21262d",
              color: node.visibility === "PUBLIC" ? "#79c0ff" : "#8b949e",
              border: `1px solid ${node.visibility === "PUBLIC" ? "#1f6feb66" : "#30363d"}`,
            }}>
              {node.visibility}
            </span>
          </div>
        )}
        {tags.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Tags</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {tags.map(t => (
                <span key={t} style={{
                  fontSize: 10, background: "#1f2d3d", color: "#58a6ff",
                  border: "1px solid #1f6feb44", borderRadius: 5, padding: "2px 7px",
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
        {!isArtifact && (
          <p style={{ fontSize: 11, color: "#8b949e", marginTop: 8 }}>
            Double-click to open this {node.type} in the Archive.
          </p>
        )}
        {isArtifact && (
          <p style={{ fontSize: 11, color: "#8b949e", marginTop: 8 }}>
            Double-click to open the artifact workspace.
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #30363d", display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          onClick={onOpen}
          style={{
            width: "100%", padding: "8px 0", borderRadius: 6, cursor: "pointer",
            background: "#1f6feb", border: "none", color: "#e6edf3",
            fontSize: 12, fontWeight: 600, fontFamily: "Inter, sans-serif",
            transition: "background 0.15s ease",
          }}
        >
          Open {isArtifact ? "Workspace" : "in Archive"}
        </button>
        {isArtifact && node.visibility === "PUBLIC" && onDownload && (
          <button
            onClick={onDownload}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 6, cursor: "pointer",
              background: "#21262d", border: "1px solid #30363d", color: "#e6edf3",
              fontSize: 12, fontWeight: 600, fontFamily: "Inter, sans-serif",
              transition: "background 0.15s ease",
            }}
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend
// ─────────────────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: "Member",  color: NODE_COLORS.member.border },
    { label: "Set",     color: NODE_COLORS.set.border },
    { label: "Subset",  color: NODE_COLORS.subset.border },
    { label: "Text",    color: NODE_COLORS.TEXT.border },
    { label: "PDF",     color: NODE_COLORS.PDF.border },
    { label: "Image",   color: NODE_COLORS.IMAGE.border },
    { label: "DOCX",    color: NODE_COLORS.DOCX.border },
    { label: "PPTX",    color: NODE_COLORS.PPTX.border },
    { label: "ZIP",     color: NODE_COLORS.ZIP.border },
  ];

  return (
    <div style={{
      position: "absolute", bottom: 16, left: 16, zIndex: 10,
      background: "#161b22cc", border: "1px solid #30363d",
      borderRadius: 8, padding: "8px 12px",
      backdropFilter: "blur(8px)",
      fontFamily: "Inter, sans-serif",
    }}>
      <p style={{ fontSize: 9, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Legend</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 16px" }}>
        {items.map(item => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "#8b949e" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main graph page
// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = "tree" | "floating";

function GraphInner({ search }: { search: string }) {
  const router = useRouter();
  const [teamView, setTeamView] = useState(false);
  const { data: graphData, isLoading, error } = useGraphData(teamView);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [hovered, setHovered] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Build flow graph when data or search changes, then re-fit.
  useEffect(() => {
    if (!graphData) return;
    const { nodes: fn, edges: fe } = buildFlowGraph(graphData);

    // Apply search dim — non-matching nodes go to 30% opacity
    const q = search.trim().toLowerCase();
    const mapped = q
      ? fn.map(n => ({
          ...n,
          style: {
            ...n.style,
            opacity: n.data.label?.toString().toLowerCase().includes(q) ? undefined : 0.25,
          },
        }))
      : fn;

    setNodes(mapped);
    setEdges(fe);

    // Fit after nodes are painted (two rAFs to be safe)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rfInstance?.fitView({ padding: 0.25, duration: 300 });
      });
    });
  }, [graphData, search, setNodes, setEdges, rfInstance]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_e, node) => {
    const raw = node.data.rawNode as GraphNode;
    const rect = (_e.target as HTMLElement).getBoundingClientRect?.() ?? { left: _e.clientX, top: _e.clientY };
    setHovered({ node: raw, x: rect.left ?? _e.clientX, y: rect.top ?? _e.clientY });
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHovered(null);
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelected(node.data.rawNode as GraphNode);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_e, node) => {
    const raw = node.data.rawNode as GraphNode;
    if (raw.type === "artifact") {
      router.push(`/archive/${raw.id}`);
    } else if (raw.type === "set" || raw.type === "subset") {
      router.push(`/archive`);
    }
  }, [router]);

  const handleDownload = useCallback(async () => {
    if (!selected || selected.type !== "artifact") return;
    try {
      const res = await fetch(`/api/storage/download?contentKey=${encodeURIComponent("")}`);
      // Best-effort — artifact workspace handles the real download flow
      router.push(`/archive/${selected.id}`);
    } catch {
      router.push(`/archive/${selected.id}`);
    }
  }, [selected, router]);

  if (isLoading) return (
    <div className="flex h-full items-center justify-center">
      <LoadingState label="Building graph…" />
    </div>
  );

  if (error) return (
    <div className="flex h-full items-center justify-center">
      <ErrorState message="Failed to load graph data." />
    </div>
  );

  const isEmpty = !graphData || graphData.nodes.length === 0;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* ── Floating toolbar — team view only ── */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 10, display: "flex", alignItems: "center", gap: 10,
        background: "#161b22cc", border: "1px solid #30363d",
        borderRadius: 10, padding: "8px 14px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 20px #00000066",
        fontFamily: "Inter, sans-serif",
      }}>
        {/* Team view toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
          <div
            onClick={() => setTeamView(v => !v)}
            style={{
              width: 32, height: 18, borderRadius: 9,
              background: teamView ? "#1f6feb" : "#21262d",
              border: `1px solid ${teamView ? "#388bfd" : "#30363d"}`,
              position: "relative", cursor: "pointer",
              transition: "background 0.2s ease",
            }}
          >
            <div style={{
              width: 12, height: 12, borderRadius: "50%", background: "#e6edf3",
              position: "absolute", top: 2,
              left: teamView ? 16 : 2,
              transition: "left 0.2s ease",
            }} />
          </div>
          <span style={{ fontSize: 11, color: teamView ? "#79c0ff" : "#8b949e", fontWeight: 500 }}>
            Team view
          </span>
        </label>

        <div style={{ width: 1, height: 20, background: "#30363d" }} />

        <span style={{ fontSize: 10, color: "#6e7681", userSelect: "none", whiteSpace: "nowrap" }}>
          Drag to select · Ctrl+click to add
        </span>
      </div>

      {/* ── Empty state overlay (toolbar still visible so user can switch to team view) ── */}
      {isEmpty && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, pointerEvents: "none",
        }}>
          <p style={{ fontSize: 14, color: "#8b949e", fontFamily: "Inter, sans-serif" }}>
            {teamView ? "No team members have published to the Library yet." : "No data to display yet."}
          </p>
          {!teamView && (
            <p style={{ fontSize: 12, color: "#484f58", fontFamily: "Inter, sans-serif" }}>
              Create sets and artifacts in your Archive, or enable Team View to see the Library.
            </p>
          )}
        </div>
      )}

      {/* ── React Flow canvas ── */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={setRfInstance}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable
        // Left-drag on empty canvas = rubber-band selection.
        // Pan with right-click drag or scroll-middle. Space+drag also pans.
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode="Control"
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0d1117" }}
      >
        <Background variant={BackgroundVariant.Dots} color="#21262d" gap={24} size={1} />
        <Controls
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
          }}
        />
        <MiniMap
          style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8 }}
          nodeColor={node => {
            const raw = node.data?.rawNode as GraphNode | undefined;
            if (!raw) return "#30363d";
            if (raw.type === "member") return "#bc8cff";
            if (raw.type === "set") return "#58a6ff";
            if (raw.type === "subset") return "#388bfd";
            const atype = raw.artifactType ?? "OTHER";
            const colorMap: Record<string, string> = {
              TEXT: "#3fb950", PDF: "#f85149", IMAGE: "#d29922",
              DOCX: "#79c0ff", PPTX: "#ffa657", ZIP: "#8b949e",
            };
            return colorMap[atype] ?? "#6e7681";
          }}
          maskColor="#0d111788"
        />
      </ReactFlow>

      <Legend />

      {/* ── Hover tooltip ── */}
      {hovered && !selected && (
        <Tooltip node={hovered.node} x={hovered.x} y={hovered.y} />
      )}

      {/* ── Side panel ── */}
      {selected && (
        <SidePanel
          node={selected}
          onClose={() => setSelected(null)}
          onOpen={() => {
            if (selected.type === "artifact") router.push(`/archive/${selected.id}`);
            else router.push("/archive");
          }}
          onDownload={selected.visibility === "PUBLIC" ? handleDownload : undefined}
        />
      )}
    </div>
  );
}

export default function GraphPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("floating");
  const [search,   setSearch]   = useState("");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold text-text-primary">Graph View</h1>
          <p className="text-xs text-text-secondary">
            {viewMode === "floating"
              ? "Force-directed constellation. Drag nodes · Scroll to zoom · Click to open."
              : "Hierarchy tree. Double-click any node to open it."}
          </p>
        </div>

        {/* View switcher + search in header */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#8b949e", fontSize: 12 }}>⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search nodes…"
              className="h-7 rounded border border-border-default bg-surface-container text-[12px] text-text-primary placeholder:text-text-secondary outline-none focus:border-primary transition-colors"
              style={{ paddingLeft: 24, paddingRight: search ? 24 : 10, width: 150 }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
            )}
          </div>

          {/* Tree / Floating pill */}
          <div style={{
            display: "flex", alignItems: "center",
            background: "#0d1117", border: "1px solid #30363d",
            borderRadius: 6, padding: 2, gap: 2,
          }}>
            {(["tree", "floating"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "3px 12px", borderRadius: 4, border: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: 500,
                  fontFamily: "Inter, sans-serif",
                  background: viewMode === mode ? "#1f6feb" : "transparent",
                  color:      viewMode === mode ? "#e6edf3"  : "#8b949e",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}
              >
                {mode === "tree" ? "Tree" : "Floating"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {viewMode === "floating" ? (
          <FloatingCanvas search={search} />
        ) : (
          <Suspense fallback={<div className="flex h-full items-center justify-center"><LoadingState label="Loading…" /></div>}>
            <GraphInner search={search} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
