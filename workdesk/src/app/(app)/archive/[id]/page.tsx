"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Clock, CheckCircle2, Loader2,
  AlertTriangle, RotateCcw, Eye, User,
  Calendar, FileText, Trash2, Share2, MoveRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useArtifactDetail, useTextContent, useSaveTextContent,
  useUpdateArtifact, useRestoreVersion, useDeleteArtifact,
} from "@/modules/archive/hooks";
import { useRecordOpen } from "@/modules/activity/hooks";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { ArtifactType } from "@/lib/enums";
import { TagPicker } from "@/components/archive/tag-picker";
import { RichTextEditor, CommitModal, EditorToolbar } from "@/components/archive/rich-text-editor";
import type { Editor } from "@tiptap/react";
import { FileViewer } from "@/components/archive/file-viewer";
import { MoveModal } from "@/components/archive/move-modal";
import { ShareDialog } from "@/components/archive/share-dialog";
import { VersionTimeline } from "@/components/archive/version-timeline";
import type { VersionDetail } from "@/modules/archive/types";

// ─────────────────────────────────────────────────────────────────────────────
// Artifact workspace — three-panel layout matching reference design:
//   [200px left nav] | [flex-1 editor canvas] | [260px metadata panel]
//
// Save-state machine: idle → saving → saved | error → idle (resets after 2s)
// Title: large inline input above editor, saves on blur.
// Metadata: all fields editable inline in right panel — no "edit info" modal.
// ─────────────────────────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ArtifactWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const recordOpen = useRecordOpen();

  const { data: artifact, isLoading, error } = useArtifactDetail(id);
  const updateArtifact = useUpdateArtifact();
  const restoreVersion = useRestoreVersion(id);
  const deleteArtifact = useDeleteArtifact();

  const isText = artifact?.type === ArtifactType.TEXT;
  const isOwner = Boolean(user && artifact && user.id === artifact.ownerId);
  const headVersion = artifact?.versions[0] ?? null;

  // Text content
  const { data: headContent, isLoading: contentLoading } = useTextContent(id, undefined, isText);
  const saveContent = useSaveTextContent(id);

  // Save state
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Left panel state
  const [historyOpen, setHistoryOpen] = useState(false);

  // Unsaved warning
  const [showUnsaved, setShowUnsaved] = useState(false);
  const pendingNavRef = useRef<string | null>(null);

  // Right panel editable fields
  const [descDraft, setDescDraft] = useState("");

  // Dialogs
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);

  // Set by RichTextEditor.onSaveDraftReady — takes optional changeSummary
  const saveDraftFnRef = useRef<((summary: string | null) => Promise<void>) | null>(null);

  // Editor instance — received via onEditorReady, used to render EditorToolbar externally
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  // Title draft
  const [titleDraft, setTitleDraft] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    if (artifact && !initializedRef.current) {
      initializedRef.current = true;
      setTitleDraft(artifact.title);
      setDescDraft(artifact.description ?? "");
    }
  }, [artifact]);

  useEffect(() => {
    if (artifact) recordOpen.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.id]);

  // beforeunload guard
  useEffect(() => {
    function guard(e: BeforeUnloadEvent) { if (isDirty) e.preventDefault(); }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty]);

  // ── Title ──────────────────────────────────────────────────────────────────

  async function handleTitleBlur() {
    if (!artifact || !titleDraft.trim() || titleDraft.trim() === artifact.title) return;
    await updateArtifact.mutateAsync({ id, payload: { title: titleDraft.trim() } });
  }

  // ── Save text content ──────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (doc: Record<string, unknown>, changeSummary: string | null) => {
      setSaveState("saving");
      try {
        await saveContent.mutateAsync({ doc, changeSummary });
        setIsDirty(false);
        setSaveState("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 3000);
      }
    },
    [saveContent]
  );

  // ── Save draft / commit ────────────────────────────────────────────────────
  // saveDraftFnRef is set by RichTextEditor via onSaveDraftReady.
  // It captures the editor's current doc and calls handleSave.

  async function handleSaveDraft() {
    if (saveDraftFnRef.current) await saveDraftFnRef.current(null);
  }

  async function handleCommit(summary: string) {
    if (saveDraftFnRef.current) await saveDraftFnRef.current(summary || null);
    setCommitOpen(false);
  }

  // ── Navigation guard ───────────────────────────────────────────────────────

  function navigateTo(href: string) {
    if (isDirty) { pendingNavRef.current = href; setShowUnsaved(true); }
    else router.push(href);
  }

  // ── Metadata saves ──────────────────────────────────────────────────────────

  async function handleDescBlur() {
    if (!artifact || descDraft === (artifact.description ?? "")) return;
    await updateArtifact.mutateAsync({ id, payload: { description: descDraft || null } });
  }

  // ── Restore version ────────────────────────────────────────────────────────

  async function handleRestore(v: VersionDetail) {
    setSaveState("saving");
    try {
      await restoreVersion.mutateAsync(v.versionNumber);
      setIsDirty(false);
      setHistoryOpen(false);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    await deleteArtifact.mutateAsync(id);
    router.replace("/archive");
  }

  // ── Count words in Tiptap doc ──────────────────────────────────────────────

  function countWords(doc: Record<string, unknown> | null | undefined): number {
    if (!doc) return 0;
    function walk(node: Record<string, unknown>): string {
      if (node.type === "text") return (node.text as string) ?? "";
      const children = (node.content as Record<string, unknown>[]) ?? [];
      return children.map(walk).join(" ");
    }
    const text = walk(doc).trim();
    return text ? text.split(/\s+/).length : 0;
  }

  const wordCount = countWords(headContent);

  function countChars(doc: Record<string, unknown> | null | undefined): number {
    if (!doc) return 0;
    function walk(node: Record<string, unknown>): string {
      if (node.type === "text") return (node.text as string) ?? "";
      const children = (node.content as Record<string, unknown>[]) ?? [];
      return children.map(walk).join("");
    }
    return walk(doc).length;
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-text-secondary" />
      </div>
    );
  }

  if (error || !artifact) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[14px] text-text-secondary">{notFound ? "Artifact not found." : "Failed to load artifact."}</p>
        <button onClick={() => router.push("/archive")} className="text-[13px] text-primary hover:underline">← Go back</button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT NAV PANEL ─────────────────────────────────────────────────── */}
      <div className="w-[200px] shrink-0 border-r border-border-default bg-surface-secondary flex flex-col">
        {/* Back */}
        <div className="px-3 py-3 border-b border-border-default">
          <button
            onClick={() => navigateTo("/archive")}
            className="flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={13} /> Archive
          </button>
        </div>

        {/* Nav items */}
        <div className="px-2 py-2 border-b border-border-default space-y-0.5">
          <LeftNavItem label="Document" active />
          <LeftNavItem
            label="Version History"
            suffix={artifact.versions.length > 0 ? `${artifact.versions.length}` : undefined}
            onClick={() => setHistoryOpen(v => !v)}
          />
        </div>

        {/* Version history — git graph */}
        {historyOpen && (
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <VersionTimeline
              artifactId={id}
              versions={artifact.versions}
            />
          </div>
        )}
      </div>

      {/* ── CENTER EDITOR ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Slim top bar: word count · status · buttons */}
        <div className="h-10 shrink-0 flex items-center justify-between px-4 border-b border-border-default bg-surface-secondary">
          <div className="flex items-center gap-3">
            {isText && (
              <span className="text-[11px] text-text-secondary">
                {wordCount} words · {countChars(headContent)} chars
              </span>
            )}
            {isDirty && saveState === "idle" && (
              <span className="flex items-center gap-1 text-[11px] text-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-warning inline-block" />
                Unsaved changes
              </span>
            )}
            <SaveIndicator state={saveState} />
          </div>

          <div className="flex items-center gap-2">
            {headVersion && (
              <span className="text-[11px] text-text-secondary">
                v{headVersion.versionNumber}{saveState === "idle" && isDirty ? " · draft" : ""}
              </span>
            )}
            {isOwner && isText && (
              <>
                <button
                  onClick={() => setHistoryOpen(v => !v)}
                  title="Toggle version history"
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded border transition-colors",
                    historyOpen
                      ? "border-primary/50 text-primary bg-primary/10"
                      : "border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                  )}
                >
                  <Clock size={13} />
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saveState === "saving" || !isDirty}
                  className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium border border-border-default rounded text-text-secondary hover:text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save draft
                </button>
                <button
                  onClick={() => setCommitOpen(true)}
                  disabled={saveState === "saving"}
                  className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium bg-primary text-on-primary rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  Commit
                </button>
              </>
            )}
            {isOwner && !isText && headVersion && (
              <span className="text-[11px] text-text-secondary">{artifact.type}</span>
            )}
          </div>
        </div>

        {/* Body: [vertical format toolbar] | [scrollable editor canvas] */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* Vertical formatting toolbar — only for text artifacts when owner */}
          {isOwner && isText && editorInstance && (
            <div className="w-9 shrink-0 border-r border-border-default bg-surface-secondary overflow-y-auto">
              <EditorToolbar editor={editorInstance} />
            </div>
          )}

          {/* Scrollable canvas */}
          <div className="flex-1 overflow-y-auto bg-surface-primary">
            <div className="max-w-[740px] mx-auto px-8 py-8">

              {/* Title */}
              {isOwner ? (
                <input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  className="w-full text-[26px] font-semibold text-text-primary bg-transparent
                             border-none outline-none placeholder:text-text-secondary/50 mb-6
                             leading-tight tracking-tight"
                  placeholder="Untitled artifact"
                />
              ) : (
                <h1 className="text-[26px] font-semibold text-text-primary mb-6 leading-tight">{artifact.title}</h1>
              )}

              {/* Content */}
              {isText ? (
                contentLoading ? (
                  <div className="text-[13px] text-text-secondary">Loading content…</div>
                ) : isOwner ? (
                  <RichTextEditor
                    initialContent={headContent ?? null}
                    onSave={handleSave}
                    saving={saveState === "saving"}
                    onChange={() => setIsDirty(true)}
                    onSaveDraftReady={fn => { saveDraftFnRef.current = fn; }}
                    onEditorReady={setEditorInstance}
                  />
                ) : (
                  <div>
                    <p className="mb-4 text-[11px] text-text-secondary border border-border-default rounded px-3 py-1.5 inline-block">
                      Read-only — you are not the owner
                    </p>
                    <RichTextEditor
                      initialContent={headContent ?? null}
                      onSave={async () => {}}
                      saving={false}
                      readOnly
                    />
                  </div>
                )
              ) : (
                headVersion ? (
                  <FileViewer contentKey={headVersion.contentKey} artifactType={artifact.type} title={artifact.title} />
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-default py-16 text-center text-text-secondary">
                    <FileText size={36} className="opacity-30" />
                    <p className="text-[14px] font-medium">No versions committed yet.</p>
                    {isOwner && <p className="text-[12px]">Use "Commit version" to upload the first file.</p>}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT METADATA PANEL ───────────────────────────────────────────── */}
      <div className="w-[260px] shrink-0 border-l border-border-default bg-surface-secondary flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-border-default">
          <span className="text-[12px] font-semibold text-text-primary">Artifact Metadata</span>
        </div>

        <div className="p-4 space-y-5">

          {/* Information */}
          <MetaSection title="Information">
            <MetaRow icon={<FileText size={12} />} label="Type">
              <span className="capitalize text-[12px] text-text-primary">{artifact.type.toLowerCase()}</span>
            </MetaRow>
            <MetaRow icon={<Eye size={12} />} label="Access">
              <span className="text-[12px] text-text-primary capitalize">
                {artifact.visibility === "PUBLIC" ? "public (library)" : artifact.visibility === "SHARED" ? "shared" : "private"}
              </span>
            </MetaRow>
            <MetaRow icon={<User size={12} />} label="Owner">
              <span className="text-[12px] text-text-primary">You</span>
            </MetaRow>
            <MetaRow icon={<Calendar size={12} />} label="Created">
              <span className="text-[12px] text-text-primary">{fmtDate(artifact.createdAt)}</span>
            </MetaRow>
            <MetaRow icon={<Clock size={12} />} label="Modified">
              <span className="text-[12px] text-text-primary">{fmtDate(artifact.updatedAt)}</span>
            </MetaRow>
          </MetaSection>

          {/* Tags */}
          <MetaSection title="Tags">
            {isOwner ? (
              <TagPicker artifactId={artifact.id} tags={artifact.tags} />
            ) : (
              <div className="flex flex-wrap gap-1">
                {artifact.tags.length === 0 ? (
                  <span className="text-[12px] text-text-secondary/60">None</span>
                ) : (
                  artifact.tags.map(t => (
                    <span key={t} className="rounded bg-surface-container-high px-2 py-0.5 text-[11px] text-text-primary">{t}</span>
                  ))
                )}
              </div>
            )}
          </MetaSection>

          {/* Description */}
          <MetaSection title="Description">
            {isOwner ? (
              <textarea
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                onBlur={handleDescBlur}
                placeholder="Add a description…"
                rows={3}
                className="w-full text-[12px] text-text-primary bg-surface-elevated border border-border-default
                           rounded px-2.5 py-2 outline-none resize-none placeholder:text-text-secondary/50
                           focus:border-primary transition-colors leading-relaxed"
              />
            ) : (
              <p className="text-[12px] text-text-secondary leading-relaxed">
                {artifact.description ?? <span className="opacity-50">No description</span>}
              </p>
            )}
          </MetaSection>

          {/* Actions */}
          {isOwner && (
            <MetaSection title="Actions">
              <div className="space-y-1.5">
                <ActionBtn icon={<Share2 size={12} />} label="Share" onClick={() => setShareOpen(true)} />
                <ActionBtn icon={<MoveRight size={12} />} label="Move to Set" onClick={() => setMoveOpen(true)} />
                <ActionBtn icon={<Trash2 size={12} />} label="Move to Trash" onClick={() => setDeleteConfirm(true)} danger />
              </div>
            </MetaSection>
          )}

        </div>
      </div>

      {/* ── UNSAVED WARNING MODAL ─────────────────────────────────────────────── */}
      {showUnsaved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-elevated border border-border-default rounded-lg shadow-xl p-5 w-[340px] space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-semibold text-text-primary">Unsaved changes</p>
                <p className="text-[13px] text-text-secondary mt-1">
                  You have unsaved changes. Save a draft before leaving, or discard them.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowUnsaved(false); pendingNavRef.current = null; }}
                className="h-8 px-3 text-[13px] border border-border-default rounded text-text-secondary hover:text-text-primary hover:bg-surface-container-high transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={() => { setIsDirty(false); setShowUnsaved(false); if (pendingNavRef.current) router.push(pendingNavRef.current); pendingNavRef.current = null; }}
                className="h-8 px-3 text-[13px] border border-danger/50 rounded text-danger hover:bg-danger/10 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ─────────────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-elevated border border-border-default rounded-lg shadow-xl p-5 w-[340px] space-y-4">
            <p className="text-[14px] font-semibold text-text-primary">Move to Trash?</p>
            <p className="text-[13px] text-text-secondary">
              "{artifact.title}" will be moved to Trash. You can restore it within 30 days.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="h-8 px-3 text-[13px] border border-border-default rounded text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteArtifact.isPending}
                className="h-8 px-3 text-[13px] bg-danger text-white rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {deleteArtifact.isPending ? "Deleting…" : "Move to Trash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHARE DIALOG ──────────────────────────────────────────────────────── */}
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        artifactId={artifact.id}
        artifactTitle={artifact.title}
      />

      {/* ── MOVE MODAL ────────────────────────────────────────────────────────── */}
      {moveOpen && (
        <MoveModal
          artifactId={artifact.id}
          currentSetId={artifact.setId}
          artifactTitle={artifact.title}
          onClose={() => setMoveOpen(false)}
        />
      )}

      {/* ── COMMIT MODAL ──────────────────────────────────────────────────────── */}
      <CommitModal
        open={commitOpen}
        saving={saveState === "saving"}
        onConfirm={handleCommit}
        onCancel={() => setCommitOpen(false)}
      />
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <div className="flex items-center gap-1.5">
      {state === "saving" && <Loader2 size={11} className="animate-spin text-text-secondary" />}
      {state === "saved" && <CheckCircle2 size={11} className="text-success" />}
      <span className={cn(
        "text-[11px]",
        state === "saving" && "text-text-secondary",
        state === "saved" && "text-success",
        state === "error" && "text-danger",
      )}>
        {state === "saving" && "Saving…"}
        {state === "saved" && "Saved"}
        {state === "error" && "Save failed"}
      </span>
    </div>
  );
}

function LeftNavItem({ label, active, suffix, onClick }: {
  label: string; active?: boolean; suffix?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center justify-between h-7 px-2 rounded text-[12px] transition-colors",
        active
          ? "bg-primary/15 text-primary font-medium"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
      )}
    >
      {label}
      {suffix && (
        <span className="text-[10px] bg-surface-container-high rounded px-1.5 py-0.5 text-text-secondary">{suffix}</span>
      )}
    </button>
  );
}

function MetaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-secondary mb-2">{title}</p>
      {children}
    </div>
  );
}

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-1.5 text-text-secondary shrink-0">
        {icon}
        <span className="text-[12px]">{label}</span>
      </div>
      <div className="ml-2 text-right">{children}</div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 h-7 px-2.5 rounded text-[12px] border transition-colors",
        danger
          ? "border-danger/30 text-danger hover:bg-danger/10"
          : "border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
      )}
    >
      {icon}{label}
    </button>
  );
}
