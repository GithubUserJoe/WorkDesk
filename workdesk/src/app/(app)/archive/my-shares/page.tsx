"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { useMyShares, useRevokeShare, type OutgoingShare } from "@/modules/archive/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// /archive/my-shares — Artifacts the current user has shared with others.
// Shows who each item is shared with and allows revoking.
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function ShareRow({ item }: { item: OutgoingShare }) {
  const router = useRouter();
  const revoke = useRevokeShare(item.artifactId);

  async function handleRevoke(e: React.MouseEvent) {
    e.stopPropagation();
    await revoke.mutateAsync(item.granteeId);
  }

  return (
    <li
      className="flex cursor-pointer items-center justify-between rounded-lg border border-border-default bg-surface-container px-4 py-3 hover:bg-surface-container-high"
      onClick={() => router.push(`/archive/${item.artifactId}`)}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text-primary">{item.artifactTitle}</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          Shared with <span className="text-text-primary">{item.granteeName}</span>
          {" "}({item.granteeEmail}) · {fmtDate(item.sharedAt)}
        </p>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2">
        <span className="rounded bg-surface-container-high px-2 py-0.5 text-xs text-text-secondary">
          {item.artifactType}
        </span>
        <button
          onClick={handleRevoke}
          disabled={revoke.isPending}
          title="Unshare"
          className="flex h-7 w-7 items-center justify-center rounded border border-border-default text-text-secondary transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-40"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

export default function SharedArchivePage() {
  const { data: items, isLoading, error } = useMyShares();

  return (
    <div className="px-8 py-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/archive" className="text-sm text-text-secondary hover:text-text-primary">
          ← Archive
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary">Shared Archive</h1>
        <p className="ml-1 text-sm text-text-secondary">Items you have shared with team members</p>
      </div>

      {isLoading && <LoadingState label="Loading shared items…" />}
      {error && <ErrorState message="Failed to load shared items." />}
      {!isLoading && !error && items?.length === 0 && (
        <EmptyState title="You haven't shared anything yet." />
      )}

      {!isLoading && !error && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <ShareRow key={item.shareId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
