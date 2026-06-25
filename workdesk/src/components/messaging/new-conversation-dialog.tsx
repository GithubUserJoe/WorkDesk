"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { useStartConversation } from "@/modules/messaging/hooks";
import type { MemberSummary } from "@/app/api/members/route";

// ─────────────────────────────────────────────────────────────────────────────
// New conversation dialog — pick a member and send the first message.
// ─────────────────────────────────────────────────────────────────────────────

export function NewConversationDialog({
  open,
  onClose,
  onCreated,
  initialUserId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  initialUserId?: string;
}) {
  const { data: members = [] } = useQuery<MemberSummary[]>({
    queryKey: ["members"],
    queryFn: () => api.get<MemberSummary[]>("/api/members"),
    enabled: open,
    staleTime: 60_000,
  });

  const start = useStartConversation();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialUserId ?? null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSearch(""); setSelectedId(initialUserId ?? null); setBody(""); setError(null);
  }

  function handleClose() { reset(); onClose(); }

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );
  const selected = members.find((m) => m.id === selectedId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) { setError("Select a recipient."); return; }
    setError(null);
    try {
      const result = await start.mutateAsync({ otherUserId: selectedId, body });
      reset();
      onCreated(result.conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send message.");
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New message">
      <form onSubmit={handleSubmit} className="space-y-4">
        {!selected ? (
          <Field label="To" htmlFor="msg-search">
            <Input
              id="msg-search"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border-default divide-y divide-border-default">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-text-secondary">No members found.</li>
              ) : (
                filtered.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-container-high"
                      onClick={() => setSelectedId(m.id)}
                    >
                      <span className="text-sm text-text-primary">{m.name}</span>
                      <span className="ml-auto text-xs text-text-secondary">{m.email}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Field>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-surface-container px-3 py-2">
            <span className="text-sm text-text-primary">{selected.name}</span>
            <span className="text-xs text-text-secondary">{selected.email}</span>
            <button
              type="button"
              className="ml-auto text-xs text-text-secondary hover:text-danger"
              onClick={() => setSelectedId(null)}
            >
              ✕
            </button>
          </div>
        )}

        <Field label="Message" htmlFor="msg-body">
          <Textarea
            id="msg-body"
            required
            rows={4}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
          />
        </Field>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={start.isPending || !selectedId || !body.trim()}>
            {start.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
