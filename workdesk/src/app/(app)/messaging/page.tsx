"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { NewConversationDialog } from "@/components/messaging/new-conversation-dialog";
import {
  useConversations,
  useConversation,
  useSendMessage,
} from "@/modules/messaging/hooks";
import { useAuth } from "@/lib/auth-context";
import type { MessageItem } from "@/modules/messaging/types";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Messages — two-pane layout: conversation list ← | → thread + composer
// ─────────────────────────────────────────────────────────────────────────────

function fmtRelative(d: Date | string | null): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "short" });
}

// ── Conversation list pane ────────────────────────────────────────────────────

function ConversationList({
  activeId,
  onSelect,
  onCompose,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onCompose: () => void;
}) {
  const { data: convosPage, isLoading, error } = useConversations();
  const convos = convosPage?.items;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border-default">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h2 className="font-semibold text-text-primary">Messages</h2>
        <Button variant="secondary" className="h-7 text-xs" onClick={onCompose}>
          Compose
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-4"><LoadingState label="Loading…" /></div>}
        {error && <div className="p-4"><ErrorState message="Failed to load." /></div>}
        {!isLoading && !error && convos?.length === 0 && (
          <div className="p-4">
            <EmptyState title="No conversations yet" hint="Compose a message to get started." />
          </div>
        )}
        {convos?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={
              "w-full text-left px-4 py-3 border-b border-border-default transition-colors hover:bg-surface-container " +
              (activeId === c.id ? "bg-surface-container-high" : "")
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-text-primary">
                {c.otherUserName}
              </span>
              <span className="shrink-0 text-xs text-text-secondary">
                {fmtRelative(c.lastMessageAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="truncate text-xs text-text-secondary flex-1">
                {c.lastMessage ?? "No messages yet"}
              </span>
              {c.unreadCount > 0 && (
                <span className="shrink-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

// ── Artifact reference card ───────────────────────────────────────────────────

function ArtifactRefCard({ id, title, type }: { id: string; title: string; type: string }) {
  return (
    <Link
      href={`/archive/${id}`}
      className="mt-1 flex items-center gap-2 rounded-md border border-border-default bg-surface-container px-3 py-2 text-xs hover:bg-surface-container-high"
    >
      <span className="text-text-secondary">{type}</span>
      <span className="truncate font-medium text-text-primary">{title}</span>
      <span className="ml-auto text-primary">↗</span>
    </Link>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine }: { msg: MessageItem; isMine: boolean }) {
  return (
    <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} gap-0.5`}>
      {!isMine && (
        <span className="text-xs text-text-secondary px-1">{msg.senderName}</span>
      )}
      <div
        className={
          "max-w-[70%] rounded-xl px-3 py-2 text-sm " +
          (isMine
            ? "bg-primary text-white rounded-br-sm"
            : "bg-surface-container text-text-primary rounded-bl-sm")
        }
      >
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        {msg.artifactRefId && msg.artifactRefTitle && (
          <ArtifactRefCard
            id={msg.artifactRefId}
            title={msg.artifactRefTitle}
            type={msg.artifactRefType ?? ""}
          />
        )}
      </div>
      <span className="text-[10px] text-text-secondary px-1">{fmtRelative(msg.createdAt)}</span>
    </div>
  );
}

// ── Thread pane ───────────────────────────────────────────────────────────────

function ThreadPane({ conversationId, userId }: { conversationId: string; userId: string }) {
  const { data: detail, isLoading, error } = useConversation(conversationId);
  const send = useSendMessage(conversationId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages load or new message sent.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSendError(null);
    try {
      await send.mutateAsync({ body: draft.trim() });
      setDraft("");
    } catch {
      setSendError("Failed to send message.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as unknown as React.FormEvent);
    }
  }

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><LoadingState label="Loading messages…" /></div>;
  if (error || !detail) return <div className="flex-1 flex items-center justify-center"><ErrorState message="Failed to load conversation." /></div>;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border-default px-5 py-3">
        <p className="font-semibold text-text-primary">{detail.otherUserName}</p>
        <p className="text-xs text-text-secondary">{detail.otherUserEmail}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {detail.hasMore && (
          <p className="text-center text-xs text-text-secondary">Scroll up to load more</p>
        )}
        {detail.messages.length === 0 && (
          <p className="text-center text-sm text-text-secondary">No messages yet. Say hello!</p>
        )}
        {detail.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isMine={msg.senderId === userId} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="border-t border-border-default px-4 py-3"
      >
        {sendError && <p className="mb-2 text-xs text-danger">{sendError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 resize-none rounded-lg border border-border-default bg-surface-container px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            rows={2}
            placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={4000}
          />
          <Button type="submit" disabled={send.isPending || !draft.trim()} className="shrink-0">
            {send.isPending ? "…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Inner page (uses useSearchParams — must be inside Suspense) ───────────────

function MessagingInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [composeOpen, setComposeOpen] = useState(false);

  const activeId = searchParams.get("c");

  function selectConversation(id: string) {
    router.replace(`/messaging?c=${id}`);
  }

  function handleCreated(conversationId: string) {
    setComposeOpen(false);
    selectConversation(conversationId);
  }

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationList
        activeId={activeId}
        onSelect={selectConversation}
        onCompose={() => setComposeOpen(true)}
      />

      <main className="flex flex-1 overflow-hidden">
        {activeId && user ? (
          <ThreadPane conversationId={activeId} userId={user.id} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title="Select a conversation"
              hint="Choose one from the list or compose a new message."
              action={<Button onClick={() => setComposeOpen(true)}>Compose</Button>}
            />
          </div>
        )}
      </main>

      <NewConversationDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MessagingPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><LoadingState label="Loading messages…" /></div>}>
      <MessagingInner />
    </Suspense>
  );
}
