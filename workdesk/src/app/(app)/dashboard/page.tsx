"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive, FileText, Clock, Star, FolderOpen, Plus, ArrowRight, Activity, Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useSets, useArtifacts, useStarred, useStorageUsage } from "@/modules/archive/hooks";
import { useActivityFeed } from "@/modules/activity/hooks";
import type { ActivityEvent } from "@/modules/activity/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const EVENT_LABELS: Record<string, string> = {
  ARTIFACT_CREATED: "Created artifact",
  ARTIFACT_UPDATED: "Updated artifact",
  ARTIFACT_DELETED: "Moved to trash",
  ARTIFACT_RESTORED: "Restored artifact",
  VERSION_COMMITTED: "Committed version",
  VERSION_RESTORED: "Restored version",
  SET_CREATED: "Created Set",
  SET_UPDATED: "Updated Set",
  SET_DELETED: "Deleted Set",
  SET_RESTORED: "Restored Set",
};

const EVENT_DOT: Record<string, string> = {
  ARTIFACT_CREATED: "text-[#3fb950]",
  VERSION_COMMITTED: "text-[#3fb950]",
  SET_CREATED: "text-[#3fb950]",
  ARTIFACT_RESTORED: "text-[#58a6ff]",
  VERSION_RESTORED: "text-[#58a6ff]",
  SET_RESTORED: "text-[#58a6ff]",
  ARTIFACT_DELETED: "text-[#f85149]",
  SET_DELETED: "text-[#f85149]",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-text-secondary">
        {icon}
        <span className="text-[12px]">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-text-primary">{value}</span>
    </div>
  );
}

function ShortcutLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="group flex h-8 items-center gap-2.5 rounded px-2 text-text-secondary transition-colors hover:bg-surface-container-high hover:text-text-primary"
    >
      <span className="text-text-secondary transition-colors group-hover:text-[#58a6ff]">{icon}</span>
      <span className="text-[12px]">{label}</span>
    </Link>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const label = EVENT_LABELS[event.eventType] ?? event.eventType;
  const dot   = EVENT_DOT[event.eventType] ?? "text-text-secondary";
  const title = event.title ?? (event.details?.title as string | undefined) ?? "—";
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 shrink-0 text-xs font-bold ${dot}`}>●</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-text-primary">{title}</p>
        <p className="text-[11px] text-text-secondary">{label} · {fmtDate(event.createdAt)}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: userLoading } = useAuth();

  const { data: setsPage,      isLoading: setsLoading    } = useSets("root");
  const { data: artifactsPage, isLoading: artsLoading    } = useArtifacts({});
  const { data: starred,       isLoading: starLoading    } = useStarred();
  const { data: storage,       isLoading: storageLoading } = useStorageUsage();
  const { data: activity,      isLoading: actLoading     } = useActivityFeed(8);

  const firstName = userLoading ? "" : (user?.name?.split(" ")[0] ?? "there");

  const displaySets  = (setsPage?.items      ?? []).slice(0, 6);
  const displayArts  = (artifactsPage?.items ?? []).slice(0, 5);
  const starredArts  = (starred?.artifacts ?? []).slice(0, 3);
  const starredSets  = (starred?.sets      ?? []).slice(0, 3);
  const starredAll   = [
    ...starredArts.map(a => ({ id: a.id, label: a.title, sub: a.type,  href: `/archive/${a.id}` })),
    ...starredSets.map(s => ({ id: s.id, label: s.name,  sub: "Set",   href: `/archive?setId=${s.id}` })),
  ].slice(0, 5);
  const activityItems = activity ?? [];

  const storagePct   = storage ? Math.min(100, storage.usedPercent) : 0;
  const storageColor = storagePct >= 90 ? "bg-[#f85149]" : storagePct >= 70 ? "bg-[#d29922]" : "bg-[#58a6ff]";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface-primary">
      <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-end justify-between border-b border-border-default pb-4">
          <div>
            <h1 className="text-[22px] font-semibold text-text-primary tracking-tight">
              {greeting()}{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              Here&apos;s what&apos;s happening in your workspace.
            </p>
          </div>
          <button
            onClick={() => router.push("/archive")}
            className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded border border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <Plus size={13} />
            New Artifact
          </button>
        </div>

        {/* ── Bento grid ── */}
        <div className="grid grid-cols-12 gap-4">

          {/* Sets overview — 8 cols */}
          <div className="col-span-8 rounded-lg border border-border-default bg-surface-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="text-[#58a6ff]" />
                <span className="text-[13px] font-semibold text-text-primary">My Archive</span>
              </div>
              <Link href="/archive" className="flex items-center gap-1 text-[11px] text-[#58a6ff] hover:underline">
                Open explorer <ArrowRight size={11} />
              </Link>
            </div>

            {setsLoading && <p className="text-[12px] text-text-secondary">Loading…</p>}
            {!setsLoading && displaySets.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center">
                  <FolderOpen size={20} className="text-text-secondary" />
                </div>
                <p className="text-[13px] text-text-secondary">No sets yet.</p>
                <Link href="/archive" className="text-[12px] text-[#58a6ff] hover:underline">
                  Create your first Set →
                </Link>
              </div>
            )}
            {!setsLoading && displaySets.length > 0 && (
              <div className="space-y-1">
                {displaySets.map(s => (
                  <Link
                    key={s.id}
                    href={`/archive?setId=${s.id}`}
                    className="group flex items-center gap-3 h-9 px-3 rounded hover:bg-surface-container-high transition-colors"
                  >
                    <FolderOpen size={14} className="shrink-0 text-text-secondary transition-colors group-hover:text-[#58a6ff]" />
                    <span className="flex-1 truncate text-[13px] text-text-primary">{s.name}</span>
                    <ArrowRight size={12} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
                {(setsPage?.items ?? []).length > 6 && (
                  <p className="text-[11px] text-text-secondary px-3 pt-1">
                    +{(setsPage?.items ?? []).length - 6} more
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right column — 4 cols */}
          <div className="col-span-4 space-y-4">

            {/* Quick stats */}
            <div className="rounded-lg border border-border-default bg-surface-elevated p-4 space-y-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                Quick Stats
              </p>
              <StatRow
                icon={<FolderOpen size={13} />}
                label="Sets"
                value={setsLoading ? "—" : String(setsPage?.total ?? 0)}
              />
              <StatRow
                icon={<FileText size={13} />}
                label="Artifacts"
                value={artsLoading ? "—" : String(artifactsPage?.total ?? 0)}
              />
              <StatRow
                icon={<Star size={13} />}
                label="Starred"
                value={starLoading ? "—" : String((starred?.artifacts ?? []).length + (starred?.sets ?? []).length)}
              />
              {!storageLoading && storage && (
                <div className="pt-1 space-y-1.5">
                  <div className="flex justify-between text-[10px] text-text-secondary">
                    <span>{formatBytes(storage.usedBytes)}</span>
                    <span>{storagePct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className={`h-full rounded-full transition-all ${storageColor}`}
                      style={{ width: `${storagePct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quick access */}
            <div className="rounded-lg border border-border-default bg-surface-elevated p-4 space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                Quick Access
              </p>
              <ShortcutLink href="/archive"         icon={<Archive  size={13} />} label="Archive Explorer" />
              <ShortcutLink href="/archive/starred" icon={<Star     size={13} />} label="Starred" />
              <ShortcutLink href="/archive/trash"   icon={<Trash2   size={13} />} label="Trash" />
              <ShortcutLink href="/bulletin"        icon={<Activity size={13} />} label="Bulletin" />
            </div>
          </div>

          {/* Recently modified — full width */}
          <div className="col-span-12 rounded-lg border border-border-default bg-surface-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#58a6ff]" />
                <span className="text-[13px] font-semibold text-text-primary">Recently Modified</span>
              </div>
              <Link href="/archive" className="flex items-center gap-1 text-[11px] text-[#58a6ff] hover:underline">
                View all <ArrowRight size={11} />
              </Link>
            </div>

            {artsLoading && <p className="text-[12px] text-text-secondary">Loading…</p>}
            {!artsLoading && displayArts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <FileText size={24} className="text-text-secondary" />
                <p className="text-[13px] text-text-secondary">No artifacts yet.</p>
                <Link href="/archive" className="text-[12px] text-[#58a6ff] hover:underline">
                  Create your first artifact →
                </Link>
              </div>
            )}
            {!artsLoading && displayArts.length > 0 && (
              <div className="space-y-1">
                {displayArts.map(a => (
                  <Link
                    key={a.id}
                    href={`/archive/${a.id}`}
                    className="group flex items-center gap-3 h-9 px-3 rounded hover:bg-surface-container-high transition-colors"
                  >
                    <FileText size={14} className="shrink-0 text-text-secondary transition-colors group-hover:text-[#58a6ff]" />
                    <span className="flex-1 truncate text-[13px] text-text-primary">{a.title}</span>
                    {a.setId && (
                      <span className="hidden sm:block shrink-0 text-[11px] text-text-secondary">
                        {(setsPage?.items ?? []).find(s => s.id === a.setId)?.name ?? ""}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-text-secondary">{fmtDate(a.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Starred — 6 cols */}
          <div className="col-span-6 rounded-lg border border-border-default bg-surface-elevated p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-[#58a6ff]" />
              <span className="text-[13px] font-semibold text-text-primary">Starred</span>
            </div>
            {starLoading && <p className="text-[12px] text-text-secondary">Loading…</p>}
            {!starLoading && starredAll.length === 0 && (
              <p className="text-[12px] text-text-secondary py-4 text-center">Nothing starred yet.</p>
            )}
            {!starLoading && starredAll.length > 0 && (
              <div className="space-y-1">
                {starredAll.map(item => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-center gap-3 h-9 px-3 rounded hover:bg-surface-container-high transition-colors"
                  >
                    <Star size={13} className="shrink-0 text-[#d29922]" fill="currentColor" />
                    <span className="flex-1 truncate text-[13px] text-text-primary">{item.label}</span>
                    <span className="text-[11px] text-text-secondary">{item.sub}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Activity — 6 cols */}
          <div className="col-span-6 rounded-lg border border-border-default bg-surface-elevated p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={14} className="text-[#58a6ff]" />
              <span className="text-[13px] font-semibold text-text-primary">Activity</span>
            </div>
            {actLoading && <p className="text-[12px] text-text-secondary">Loading…</p>}
            {!actLoading && activityItems.length === 0 && (
              <p className="text-[12px] text-text-secondary py-4 text-center">No activity yet.</p>
            )}
            {!actLoading && activityItems.length > 0 && (
              <div className="space-y-3">
                {activityItems.map(e => <ActivityRow key={e.id} event={e} />)}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
