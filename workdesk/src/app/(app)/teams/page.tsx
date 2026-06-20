"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Hash, Copy, Check, Trash2, LogOut, ChevronRight, Crown, Shield } from "lucide-react";
import {
  useMyRooms,
  useCreateRoom,
  useJoinRoom,
  useRoomDetail,
  useDeleteRoom,
  useLeaveRoom,
} from "@/modules/teams/hooks";
import { ApiError } from "@/lib/api-client";
import { RoomMemberRole } from "@/lib/enums";
import type { RoomMembership } from "@/modules/teams/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Create Room Modal
// ─────────────────────────────────────────────────────────────────────────────

function CreateRoomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (roomId: string, joinCode: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useCreateRoom();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const room = await mutateAsync(name.trim());
      onCreated(room.id, room.joinCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create room.");
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="mb-1 text-base font-semibold text-text-primary">Create a Team Room</h2>
      <p className="mb-5 text-sm text-text-secondary">
        Give your room a name. A unique join code will be generated automatically.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-text-secondary" htmlFor="room-name">
            Room name
          </label>
          <input
            id="room-name"
            type="text"
            autoFocus
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Flex Studios Core Team"
            className="w-full rounded-md border border-border-default bg-surface-container px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 flex-1 rounded-md border border-border-default text-sm text-text-secondary transition-colors hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || name.trim().length < 2}
            className="h-9 flex-1 rounded-md bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Creating…" : "Create room"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Join Code Success Modal (shown after room creation)
// ─────────────────────────────────────────────────────────────────────────────

function JoinCodeModal({ joinCode, onClose }: { joinCode: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Overlay onClose={onClose}>
      <div className="mb-1 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
          <Check size={16} className="text-primary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Room created!</h2>
      </div>
      <p className="mb-5 text-sm text-text-secondary">
        Share the join code below with your team. Anyone with this code can join the room.
      </p>
      <div className="mb-4 rounded-md border border-border-default bg-surface-container px-4 py-3">
        <p className="mb-1 text-xs text-text-secondary">Join code</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all font-mono text-sm text-primary">{joinCode}</code>
          <button
            onClick={copy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border-default bg-surface-container-high text-text-secondary transition-colors hover:border-primary hover:text-primary"
            title="Copy join code"
          >
            {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-text-secondary">
        Keep this code safe — it grants access to the room. You can view it again from the room settings.
      </p>
      <button
        onClick={onClose}
        className="h-9 w-full rounded-md bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
      >
        Got it
      </button>
    </Overlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Join Room Modal
// ─────────────────────────────────────────────────────────────────────────────

function JoinRoomModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync, isPending } = useJoinRoom();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await mutateAsync(code.trim());
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "ALREADY_MEMBER"
            ? "You are already a member of this room."
            : err.code === "INVALID_JOIN_CODE"
            ? "Invalid join code. Please check and try again."
            : err.message
          : "Failed to join room."
      );
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h2 className="mb-1 text-base font-semibold text-text-primary">Join a Team Room</h2>
      <p className="mb-5 text-sm text-text-secondary">
        Enter the 32-character join code shared by your team.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-text-secondary" htmlFor="join-code">
            Join code
          </label>
          <input
            id="join-code"
            type="text"
            autoFocus
            required
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="aB8@Kz2!X9#mLp7$Qr5^Tv1&Wc4*Ny6"
            className="w-full rounded-md border border-border-default bg-surface-container px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <p className="mt-1 text-xs text-text-secondary">Exactly 32 characters, case-sensitive.</p>
        </div>
        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-9 flex-1 rounded-md border border-border-default text-sm text-text-secondary transition-colors hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || code.trim().length !== 32}
            className="h-9 flex-1 rounded-md bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Joining…" : "Join room"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Room Detail Panel
// ─────────────────────────────────────────────────────────────────────────────

function RoomPanel({ membership, onBack }: { membership: RoomMembership; onBack: () => void }) {
  const { data: detail, isLoading } = useRoomDetail(membership.roomId);
  const { mutateAsync: deleteRoom, isPending: deleting } = useDeleteRoom(membership.roomId);
  const { mutateAsync: leaveRoom, isPending: leaving } = useLeaveRoom(membership.roomId);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = membership.role === RoomMemberRole.OWNER;

  function copyCode() {
    if (!detail) return;
    void navigator.clipboard.writeText(detail.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    try {
      await deleteRoom();
      onBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete room.");
    }
  }

  async function handleLeave() {
    try {
      await leaveRoom();
      onBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to leave room.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-default px-6 py-4">
        <button onClick={onBack} className="text-xs text-text-secondary hover:text-text-primary">
          ← All rooms
        </button>
        <span className="text-text-secondary">/</span>
        <h2 className="text-sm font-semibold text-text-primary">{membership.roomName}</h2>
        <span className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          isOwner ? "bg-primary/15 text-primary" : "bg-surface-container text-text-secondary"
        }`}>
          {isOwner ? <Crown size={10} /> : <Shield size={10} />}
          {isOwner ? "Owner" : "Member"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Join code — visible to all members, surfaced prominently for owners */}
        {detail && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Join code
            </h3>
            <div className="flex items-center gap-2 rounded-md border border-border-default bg-surface-container px-3 py-2">
              <Hash size={13} className="shrink-0 text-text-secondary" />
              <code className="flex-1 break-all font-mono text-xs text-primary">{detail.joinCode}</code>
              <button
                onClick={copyCode}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border-default bg-surface-container-high text-text-secondary hover:border-primary hover:text-primary transition-colors"
                title="Copy join code"
              >
                {copied ? <Check size={11} className="text-primary" /> : <Copy size={11} />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-secondary">
              Share this code to invite others. Anyone with the code can join.
            </p>
          </section>
        )}

        {/* Members */}
        {detail && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Members ({detail.memberCount})
            </h3>
            <div className="space-y-1">
              {detail.members.map(m => (
                <div
                  key={m.userId}
                  className="flex items-center gap-3 rounded-md border border-border-default bg-surface-container px-3 py-2"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-xs font-semibold text-text-primary">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{m.name}</p>
                    <p className="truncate text-xs text-text-secondary">{m.email}</p>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    m.role === RoomMemberRole.OWNER ? "bg-primary/15 text-primary" : "bg-surface-container-high text-text-secondary"
                  }`}>
                    {m.role === RoomMemberRole.OWNER ? <Crown size={9} /> : <Shield size={9} />}
                    {m.role === RoomMemberRole.OWNER ? "Owner" : "Member"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Metadata */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Details</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Created</span>
              <span className="text-text-primary">{fmtDate(membership.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">You joined</span>
              <span className="text-text-primary">{fmtDate(membership.joinedAt)}</span>
            </div>
          </div>
        </section>

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        {/* Danger zone */}
        <section className="border-t border-border-default pt-4">
          {isOwner ? (
            confirmDelete ? (
              <div className="space-y-2">
                <p className="text-sm text-danger">
                  This will permanently delete the room and remove all members. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="h-8 flex-1 rounded border border-border-default text-sm text-text-secondary hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="h-8 flex-1 rounded bg-danger text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Confirm delete"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 text-sm text-danger hover:text-danger/80"
              >
                <Trash2 size={14} /> Delete room
              </button>
            )
          ) : (
            <button
              onClick={handleLeave}
              disabled={leaving}
              className="flex items-center gap-2 text-sm text-danger hover:text-danger/80 disabled:opacity-60"
            >
              <LogOut size={14} /> {leaving ? "Leaving…" : "Leave room"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Overlay wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border-default bg-surface-secondary p-6 shadow-xl">
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Room Card
// ─────────────────────────────────────────────────────────────────────────────

function RoomCard({ membership, onSelect }: { membership: RoomMembership; onSelect: () => void }) {
  const isOwner = membership.role === RoomMemberRole.OWNER;
  return (
    <button
      onClick={onSelect}
      className="group flex w-full items-center gap-4 rounded-lg border border-border-default bg-surface-secondary px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-container"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
        {membership.roomName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-text-primary">{membership.roomName}</p>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            isOwner ? "bg-primary/15 text-primary" : "bg-surface-container text-text-secondary"
          }`}>
            {isOwner ? <Crown size={9} /> : <Shield size={9} />}
            {isOwner ? "Owner" : "Member"}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {membership.memberCount} member{membership.memberCount !== 1 ? "s" : ""} · Joined {fmtDate(membership.joinedAt)}
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Teams Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TeamsPage() {
  const { data: rooms, isLoading, error } = useMyRooms();
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomMembership | null>(null);

  function handleCreated(_roomId: string, joinCode: string) {
    setModal(null);
    setCreatedCode(joinCode);
  }

  if (selectedRoom) {
    return (
      <div className="h-full">
        <RoomPanel membership={selectedRoom} onBack={() => setSelectedRoom(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Team Rooms</h1>
          <p className="text-sm text-text-secondary">
            Your workspaces. All WorkDesk modules are scoped to a room.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal("join")}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            <Hash size={14} /> Join
          </button>
          <button
            onClick={() => setModal("create")}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> Create
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-danger">Failed to load rooms.</p>
      ) : !rooms || rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border-default py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
            <Users size={22} className="text-text-secondary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">No Team Rooms yet</p>
            <p className="mt-1 text-xs text-text-secondary">
              Create a room for your organisation or join one with a code.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModal("join")}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-sm text-text-secondary hover:border-primary hover:text-primary"
            >
              <Hash size={14} /> Join with code
            </button>
            <button
              onClick={() => setModal("create")}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-on-primary hover:opacity-90"
            >
              <Plus size={14} /> Create room
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {rooms.map(m => (
            <RoomCard key={m.roomId} membership={m} onSelect={() => setSelectedRoom(m)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal === "create" && (
        <CreateRoomModal
          onClose={() => setModal(null)}
          onCreated={handleCreated}
        />
      )}
      {modal === "join" && (
        <JoinRoomModal onClose={() => setModal(null)} />
      )}
      {createdCode && (
        <JoinCodeModal joinCode={createdCode} onClose={() => setCreatedCode(null)} />
      )}
    </div>
  );
}
