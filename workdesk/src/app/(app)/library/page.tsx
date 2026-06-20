"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Plus, Search, X, Pin, FileText, FileType2, Image,
  File, Archive, ExternalLink, Trash2, Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Confirm } from "@/components/ui/confirm";
import { CreateSectionDialog } from "@/components/library/create-section-dialog";
import {
  useLibrarySections,
  useLibrarySectionArtifacts,
  useDeleteSection,
  useSubscribeSection,
  useUnsubscribeSection,
  useUnpublishArtifact,
} from "@/modules/library/hooks";
import type { LibrarySectionSummary, LibraryArtifactItem } from "@/modules/library/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sectionAccent(name: string): string {
  const ACCENTS = ["#58a6ff", "#3fb950", "#d29922", "#f85149", "#a371f7", "#79c0ff", "#ffa657", "#56d364"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  TEXT:    { icon: FileText,  color: "#3fb950", bg: "#3fb95018" },
  PDF:     { icon: FileType2, color: "#f85149", bg: "#f8514918" },
  IMAGE:   { icon: Image,     color: "#d29922", bg: "#d2992218" },
  DOCX:    { icon: FileText,  color: "#79c0ff", bg: "#79c0ff18" },
  PPTX:    { icon: File,      color: "#ffa657", bg: "#ffa65718" },
  VIDEO:   { icon: File,      color: "#a371f7", bg: "#a371f718" },
  ARCHIVE: { icon: Archive,   color: "#8b949e", bg: "#8b949e18" },
};
function typeMeta(type: string) {
  return TYPE_META[type.toUpperCase()] ?? { icon: File, color: "#8b949e", bg: "#8b949e18" };
}

function sectionTypeTags(artifacts: LibraryArtifactItem[]) {
  return [...new Set(artifacts.map(a => a.type.toUpperCase()))].slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type chip
// ─────────────────────────────────────────────────────────────────────────────

function TypeChip({ type }: { type: string }) {
  const { color, bg } = typeMeta(type);
  return (
    <span style={{ color, background: bg, border: `1px solid ${color}33`, fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 500 }}>
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pin button — icon-only, subtle
// ─────────────────────────────────────────────────────────────────────────────

function PinButton({ isPinned, pending, onPin, onUnpin }: {
  isPinned: boolean; pending: boolean; onPin: () => void; onUnpin: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={e => { e.stopPropagation(); isPinned ? onUnpin() : onPin(); }}
      title={isPinned ? "Unpin" : "Pin section"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 6, border: "none", cursor: pending ? "default" : "pointer",
        background: isPinned ? "#58a6ff18" : "transparent",
        color: isPinned ? "#58a6ff" : "#6e7681",
        transition: "background 0.15s, color 0.15s",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <Pin size={13} fill={isPinned ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section card
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({ section, isActive, isCreator, isAdmin, onSelect, onDelete, onPin, onUnpin, pinPending }: {
  section: LibrarySectionSummary; isActive: boolean; isCreator: boolean; isAdmin: boolean;
  onSelect: () => void; onDelete: () => void; onPin: () => void; onUnpin: () => void; pinPending: boolean;
}) {
  const accent = sectionAccent(section.name);

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 10, overflow: "hidden",
        border: `1px solid ${isActive ? accent + "55" : "#21262d"}`,
        background: isActive ? accent + "08" : "#161b22",
        cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ height: 3, background: accent, opacity: isActive ? 1 : 0.4, transition: "opacity 0.15s" }} />
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {section.name}
            </p>
            {section.description && (
              <p style={{ fontSize: 11, color: "#8b949e", marginTop: 2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {section.description}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <PinButton isPinned={section.isSubscribed} pending={pinPending} onPin={onPin} onUnpin={onUnpin} />
            {(isCreator || isAdmin) && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete(); }}
                title="Delete section"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer", background: "transparent", color: "#6e7681", transition: "color 0.15s, background 0.15s" }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#6e7681", display: "flex", alignItems: "center", gap: 3 }}>
            <BookOpen size={11} strokeWidth={2} /> {section.artifactCount}
          </span>
          <span style={{ fontSize: 11, color: "#6e7681", display: "flex", alignItems: "center", gap: 3 }}>
            <Users size={11} strokeWidth={2} /> {section.subscriberCount}
          </span>
          <span style={{ fontSize: 11, color: "#484f58" }}>by {section.createdByName.split(" ")[0]}</span>
        </div>
        {isActive && (
          <div style={{ marginTop: 8, height: 2, borderRadius: 1, background: accent, opacity: 0.6 }} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact item in drawer
// ─────────────────────────────────────────────────────────────────────────────

function ArtifactItem({ art, sectionId, isOwner, onOpen }: {
  art: LibraryArtifactItem; sectionId: string; isOwner: boolean; onOpen: () => void;
}) {
  const unpublish = useUnpublishArtifact(sectionId);
  const { icon: Icon, color, bg } = typeMeta(art.type);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
      borderRadius: 8, border: "1px solid #21262d", background: "#0d1117",
      transition: "border-color 0.15s",
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 7, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {art.title}
        </p>
        <p style={{ fontSize: 11, color: "#6e7681", marginTop: 1 }}>
          {art.ownerName} · {fmtDate(art.addedAt)}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <TypeChip type={art.type} />
        <button
          type="button"
          onClick={onOpen}
          title="Open"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid #30363d", background: "transparent", color: "#8b949e", cursor: "pointer", transition: "color 0.15s, border-color 0.15s" }}
        >
          <ExternalLink size={13} />
        </button>
        {isOwner && (
          <button
            type="button"
            disabled={unpublish.isPending}
            onClick={() => unpublish.mutate(art.id)}
            title="Remove from section"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: "#6e7681", cursor: "pointer", opacity: unpublish.isPending ? 0.5 : 1, transition: "color 0.15s, background 0.15s" }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section drawer
// ─────────────────────────────────────────────────────────────────────────────

function SectionDrawer({ section, userId, onClose }: {
  section: LibrarySectionSummary; userId: string; onClose: () => void;
}) {
  const router = useRouter();
  const { data: artifacts, isLoading } = useLibrarySectionArtifacts(section.id);
  const [search, setSearch] = useState("");
  const accent = sectionAccent(section.name);

  const filtered = useMemo(() => {
    if (!artifacts) return [];
    const q = search.trim().toLowerCase();
    return q
      ? artifacts.filter(a =>
          a.title.toLowerCase().includes(q) ||
          a.ownerName.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q)
        )
      : artifacts;
  }, [artifacts, search]);

  const typeTags = useMemo(() => artifacts ? sectionTypeTags(artifacts) : [], [artifacts]);

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 460,
      background: "#0d1117", borderLeft: "1px solid #21262d",
      display: "flex", flexDirection: "column", zIndex: 20,
      fontFamily: "Inter, sans-serif",
    }}>
      <style>{`
        @keyframes drawerIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .drawer-wrap { animation: drawerIn 0.18s ease; }
      `}</style>
      <div className="drawer-wrap" style={{ display: "contents" }}>
        <div style={{ height: 3, background: accent, flexShrink: 0 }} />
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3" }}>{section.name}</p>
              {section.description && (
                <p style={{ fontSize: 12, color: "#8b949e", marginTop: 3 }}>{section.description}</p>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#6e7681" }}>by {section.createdByName}</span>
                <span style={{ fontSize: 11, color: "#6e7681" }}>{section.artifactCount} artifact{section.artifactCount !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: 11, color: "#6e7681" }}>{section.subscriberCount} pinned</span>
              </div>
              {typeTags.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                  {typeTags.map(t => <TypeChip key={t} type={t} />)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: "#6e7681", cursor: "pointer", flexShrink: 0, transition: "color 0.15s, background 0.15s" }}
            >
              <X size={15} />
            </button>
          </div>
          <div style={{ position: "relative", marginTop: 12 }}>
            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#6e7681", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter artifacts…"
              style={{
                width: "100%", height: 30, paddingLeft: 28, paddingRight: search ? 28 : 10,
                background: "#161b22", border: "1px solid #30363d", borderRadius: 6,
                fontSize: 12, color: "#e6edf3", outline: "none", boxSizing: "border-box",
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#6e7681", cursor: "pointer" }}>
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          {isLoading && <p style={{ fontSize: 12, color: "#6e7681", padding: "20px 0", textAlign: "center" }}>Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, textAlign: "center", paddingTop: 40 }}>
              <BookOpen size={28} color="#30363d" />
              <p style={{ fontSize: 13, color: "#6e7681" }}>
                {search ? "No artifacts match your filter." : "No artifacts yet."}
              </p>
              {!search && <p style={{ fontSize: 11, color: "#484f58" }}>Publish artifacts from your workspace to add them here.</p>}
            </div>
          )}
          {filtered.map(art => (
            <ArtifactItem
              key={art.id}
              art={art}
              sectionId={section.id}
              isOwner={art.ownerId === userId}
              onOpen={() => router.push(`/archive/${art.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "discover" | "pinned" | "mine";

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const TABS: { id: Tab; label: string }[] = [
    { id: "discover", label: "Discover" },
    { id: "pinned",   label: "Pinned" },
    { id: "mine",     label: "My Sections" },
  ];
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #21262d", padding: "0 20px", gap: 2, flexShrink: 0 }}>
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          style={{
            padding: "9px 14px", background: "none", border: "none",
            cursor: "pointer", fontSize: 13,
            fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? "#e6edf3" : "#6e7681",
            borderBottom: `2px solid ${tab === t.id ? "#58a6ff" : "transparent"}`,
            marginBottom: -1, transition: "color 0.15s",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { user } = useAuth();
  const { data: sectionsPage, isLoading, error } = useLibrarySections();
  const sections = sectionsPage?.items ?? [];
  const deleteSection = useDeleteSection();
  const pinSection    = useSubscribeSection();
  const unpinSection  = useUnsubscribeSection();

  const [tab,           setTab]           = useState<Tab>("discover");
  const [search,        setSearch]        = useState("");
  const [activeSection, setActiveSection] = useState<LibrarySectionSummary | null>(null);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState<{ id: string; name: string } | null>(null);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [pinPendingId,  setPinPendingId]  = useState<string | null>(null);

  const userId  = user?.id   ?? "";
  const isAdmin = user?.role === "ADMIN";

  const visibleSections = useMemo(() => {
    let list = sections;
    if (tab === "pinned") list = list.filter(s => s.isSubscribed);
    if (tab === "mine")   list = list.filter(s => s.createdBy === userId);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.createdByName.toLowerCase().includes(q)
    );
    return list;
  }, [sections, tab, search, userId]);

  function handlePin(id: string) {
    setPinPendingId(id);
    pinSection.mutate(id, { onSettled: () => setPinPendingId(null) });
  }
  function handleUnpin(id: string) {
    setPinPendingId(id);
    unpinSection.mutate(id, { onSettled: () => setPinPendingId(null) });
  }
  function handleSelect(s: LibrarySectionSummary) {
    setActiveSection(prev => prev?.id === s.id ? null : s);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontFamily: "Inter, sans-serif", background: "#0d1117" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 14px", flexShrink: 0, borderBottom: "1px solid #161b22" }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3", margin: 0, lineHeight: 1.3 }}>Library</h1>
          <p style={{ fontSize: 11, color: "#6e7681", margin: "2px 0 0" }}>Shared knowledge, published by your team.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#6e7681", pointerEvents: "none" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sections…"
              style={{
                height: 30, paddingLeft: 28, paddingRight: search ? 28 : 10, width: 175,
                background: "#161b22", border: "1px solid #30363d", borderRadius: 6,
                fontSize: 12, color: "#e6edf3", outline: "none",
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#6e7681", cursor: "pointer" }}>
                <X size={11} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px",
              background: "#1f6feb", border: "none", borderRadius: 6,
              fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer",
            }}
          >
            <Plus size={13} />
            New section
          </button>
        </div>
      </div>

      {/* Tabs */}
      <TabBar tab={tab} onChange={t => { setTab(t); setActiveSection(null); }} />

      {/* Body */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Scrollable grid — shrinks when drawer is open */}
        <div style={{
          position: "absolute", inset: 0,
          right: activeSection ? 460 : 0,
          overflowY: "auto",
          transition: "right 0.2s ease",
        }}>
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#6e7681", fontSize: 13 }}>Loading…</div>
          )}
          {error && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#f85149", fontSize: 13 }}>Failed to load library.</div>
          )}
          {!isLoading && !error && visibleSections.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "#6e7681" }}>
              <BookOpen size={36} color="#30363d" />
              <p style={{ fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                {tab === "pinned" ? "You haven't pinned any sections yet." : tab === "mine" ? "You haven't created any sections yet." : search ? "No sections match your search." : "No sections yet."}
              </p>
              {tab !== "pinned" && !search && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", background: "#21262d", border: "1px solid #30363d", borderRadius: 6, fontSize: 12, color: "#e6edf3", cursor: "pointer" }}
                >
                  <Plus size={13} /> Create a section
                </button>
              )}
            </div>
          )}
          {!isLoading && !error && visibleSections.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, padding: "16px 20px", alignContent: "start" }}>
              {visibleSections.map(s => (
                <SectionCard
                  key={s.id}
                  section={s}
                  isActive={activeSection?.id === s.id}
                  isCreator={s.createdBy === userId}
                  isAdmin={isAdmin}
                  onSelect={() => handleSelect(s)}
                  onDelete={() => { setDeleteError(null); setDeleteTarget({ id: s.id, name: s.name }); }}
                  onPin={() => handlePin(s.id)}
                  onUnpin={() => handleUnpin(s.id)}
                  pinPending={pinPendingId === s.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Drawer */}
        {activeSection && user && (
          <SectionDrawer
            section={activeSection}
            userId={userId}
            onClose={() => setActiveSection(null)}
          />
        )}
      </div>

      <CreateSectionDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <Confirm
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete section"
        message={`Delete "${deleteTarget?.name}"? Artifacts will remain in their owners' archives. This cannot be undone.`}
        confirmLabel="Delete"
        busy={deleteSection.isPending}
        error={deleteError}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSection.mutate(deleteTarget.id, {
            onSuccess: () => {
              if (activeSection?.id === deleteTarget.id) setActiveSection(null);
              setDeleteTarget(null);
            },
            onError: () => setDeleteError("Failed to delete section."),
          });
        }}
      />
    </div>
  );
}
