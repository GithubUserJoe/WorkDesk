"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { useShareSet } from "@/modules/archive/hooks";

// ─────────────────────────────────────────────────────────────────────────────
// Share Set dialog — shares all artifacts in a folder with a team member.
// ─────────────────────────────────────────────────────────────────────────────

export function ShareSetDialog({
  open,
  onClose,
  setId,
  setName,
}: {
  open: boolean;
  onClose: () => void;
  setId: string;
  setName: string;
}) {
  const shareSet = useShareSet();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sharedCount: number } | null>(null);

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const r = await shareSet.mutateAsync({ setId, granteeEmail: email.trim() });
      setResult(r);
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to share folder.");
    }
  }

  function handleClose() {
    setEmail("");
    setError(null);
    setResult(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Share "${setName}"`}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          All artifacts inside this folder (and its sub-folders) will be shared with the recipient.
          They will appear in their <strong className="text-text-primary">Shared with me</strong> section.
        </p>
        <form onSubmit={handleShare} className="space-y-3">
          <Field label="Share with (email address)" htmlFor="share-set-email">
            <div className="flex gap-2">
              <Input
                id="share-set-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1"
              />
              <Button type="submit" disabled={shareSet.isPending || !email.trim()}>
                {shareSet.isPending ? "Sharing…" : "Share"}
              </Button>
            </div>
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {result && (
            <p className="text-sm text-success">
              {result.sharedCount === 0
                ? "All items were already shared with this person."
                : `Shared ${result.sharedCount} item${result.sharedCount !== 1 ? "s" : ""} successfully.`}
            </p>
          )}
        </form>
      </div>
    </Modal>
  );
}
