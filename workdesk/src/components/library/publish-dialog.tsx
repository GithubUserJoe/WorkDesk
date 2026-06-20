"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/states";
import { ApiError } from "@/lib/api-client";
import {
  useLibrarySections,
  useArtifactSections,
  usePublishArtifact,
  useUnpublishArtifact,
} from "@/modules/library/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// PublishDialog — owner picks which library section(s) to publish an artifact to.
// Shows current memberships with remove, and remaining sections to add.
// ─────────────────────────────────────────────────────────────────────────────

export function PublishDialog({
  open,
  onClose,
  artifactId,
  artifactTitle,
}: {
  open: boolean;
  onClose: () => void;
  artifactId: string;
  artifactTitle: string;
}) {
  const { data: allSectionsPage, isLoading: sectionsLoading } = useLibrarySections();
  const allSections = allSectionsPage?.items ?? [];
  const { data: myMemberships = [], isLoading: membershipsLoading } = useArtifactSections(
    artifactId,
    open
  );

  const [error, setError] = useState<string | null>(null);

  const membershipIds = new Set(myMemberships.map((s) => s.id));
  const availableSections = allSections.filter((s) => !membershipIds.has(s.id));

  const isLoading = sectionsLoading || membershipsLoading;

  return (
    <Modal open={open} onClose={onClose} title={`Publish "${artifactTitle}"`}>
      <div className="space-y-4">
        {isLoading && <LoadingState label="Loading sections…" />}

        {!isLoading && (
          <>
            {/* Current memberships */}
            {myMemberships.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Published in
                </p>
                <ul className="divide-y divide-border-default rounded-lg border border-border-default">
                  {myMemberships.map((s) => (
                    <MembershipRow
                      key={s.id}
                      sectionId={s.id}
                      sectionName={s.name}
                      artifactId={artifactId}
                      onError={setError}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Available sections */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                {myMemberships.length > 0 ? "Add to another section" : "Publish to section"}
              </p>
              {availableSections.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  {allSections.length === 0
                    ? "No library sections exist yet. Create one from the Library page."
                    : "This artifact is already in all sections."}
                </p>
              ) : (
                <ul className="divide-y divide-border-default rounded-lg border border-border-default">
                  {availableSections.map((s) => (
                    <AddToSectionRow
                      key={s.id}
                      sectionId={s.id}
                      sectionName={s.name}
                      artifactCount={s.artifactCount}
                      artifactId={artifactId}
                      onError={setError}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function MembershipRow({
  sectionId,
  sectionName,
  artifactId,
  onError,
}: {
  sectionId: string;
  sectionName: string;
  artifactId: string;
  onError: (msg: string) => void;
}) {
  const unpublish = useUnpublishArtifact(sectionId);
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div>
        <p className="text-sm text-text-primary">{sectionName}</p>
        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">PUBLIC</span>
      </div>
      <Button
        variant="ghost"
        className="h-6 shrink-0 text-xs text-danger hover:text-danger"
        disabled={unpublish.isPending}
        onClick={() =>
          unpublish.mutate(artifactId, {
            onError: (err) =>
              onError(err instanceof ApiError ? err.message : "Failed to remove."),
          })
        }
      >
        Remove
      </Button>
    </li>
  );
}

function AddToSectionRow({
  sectionId,
  sectionName,
  artifactCount,
  artifactId,
  onError,
}: {
  sectionId: string;
  sectionName: string;
  artifactCount: number;
  artifactId: string;
  onError: (msg: string) => void;
}) {
  const publish = usePublishArtifact(sectionId);
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div>
        <p className="text-sm text-text-primary">{sectionName}</p>
        <p className="text-xs text-text-secondary">{artifactCount} artifact{artifactCount !== 1 ? "s" : ""}</p>
      </div>
      <Button
        variant="secondary"
        className="h-6 shrink-0 text-xs"
        disabled={publish.isPending}
        onClick={() =>
          publish.mutate(artifactId, {
            onError: (err) =>
              onError(err instanceof ApiError ? err.message : "Failed to publish."),
          })
        }
      >
        {publish.isPending ? "…" : "Publish"}
      </Button>
    </li>
  );
}
