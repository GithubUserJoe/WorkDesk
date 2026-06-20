"use client";

import { useRouter } from "next/navigation";
import { useArtifacts } from "@/modules/archive/hooks";
import { Widget, WidgetRow, WidgetEmpty } from "./widget";

function FileIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RecentArtifactsWidget() {
  const router = useRouter();
  const { data, isLoading } = useArtifacts({});
  const items = (data?.items ?? []).slice(0, 6);

  return (
    <Widget title="Recent Artifacts">
      {isLoading && <p className="text-xs text-text-secondary">Loading…</p>}
      {!isLoading && items.length === 0 && <WidgetEmpty message="No artifacts yet." />}
      {items.map((a) => (
        <WidgetRow
          key={a.id}
          icon={<FileIcon />}
          label={a.title}
          sub={`${a.type} · Updated ${fmtDate(a.updatedAt)}`}
          onClick={() => router.push(`/archive/${a.id}`)}
        />
      ))}
    </Widget>
  );
}
