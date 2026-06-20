"use client";

import { useState } from "react";
import { Users, Plus, Hash, Check, Copy, ArrowRight } from "lucide-react";
import { useCreateRoom, useJoinRoom } from "@/modules/teams/hooks";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding page — shown on first login when the user has no team rooms.
//
// Design: full-screen, no sidebar. Two paths: Create or Join.
// After either action the user is redirected to /dashboard.
// ─────────────────────────────────────────────────────────────────────────────

type Step = "choice" | "create" | "join" | "created";

export default function OnboardingPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("choice");

  // ── Create path ────────────────────────────────────────────────────────────

  const [roomName, setRoomName]       = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinCode, setJoinCode]       = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const { mutateAsync: createRoom, isPending: creating } = useCreateRoom();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    try {
      const room = await createRoom(roomName.trim());
      setJoinCode(room.joinCode);
      setStep("created");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create room.");
    }
  }

  function copyCode() {
    if (!joinCode) return;
    void navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Join path ──────────────────────────────────────────────────────────────

  const [code, setCode]             = useState("");
  const [joinError, setJoinError]   = useState<string | null>(null);
  const { mutateAsync: joinRoom, isPending: joining } = useJoinRoom();

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    try {
      await joinRoom(code.trim());
      window.location.href = "/dashboard";
    } catch (err) {
      setJoinError(
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-primary px-4">
      <div className="w-full max-w-md">

        {/* Brand mark */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-base font-bold text-on-primary">
            W
          </div>
          <span className="text-lg font-semibold text-text-primary">WorkDesk</span>
        </div>

        {/* ── Step: choice ── */}
        {step === "choice" && (
          <>
            <h1 className="text-xl font-semibold text-text-primary">
              Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 mb-8 text-sm text-text-secondary">
              WorkDesk is organised around Team Rooms. Create one for your organisation,
              or join an existing room with a code from your team.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setStep("create")}
                className="group flex w-full items-center gap-4 rounded-lg border border-border-default bg-surface-secondary px-4 py-4 text-left transition-colors hover:border-primary/50 hover:bg-surface-container"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">Create a Team Room</p>
                  <p className="text-xs text-text-secondary">
                    Start a new workspace for your team. You&apos;ll be the owner.
                  </p>
                </div>
                <ArrowRight size={16} className="text-text-secondary transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                onClick={() => setStep("join")}
                className="group flex w-full items-center gap-4 rounded-lg border border-border-default bg-surface-secondary px-4 py-4 text-left transition-colors hover:border-primary/50 hover:bg-surface-container"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-text-secondary">
                  <Hash size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">Join a Team Room</p>
                  <p className="text-xs text-text-secondary">
                    Enter a 32-character join code shared by your team.
                  </p>
                </div>
                <ArrowRight size={16} className="text-text-secondary transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </>
        )}

        {/* ── Step: create ── */}
        {step === "create" && (
          <>
            <button onClick={() => setStep("choice")} className="mb-4 text-xs text-text-secondary hover:text-text-primary">
              ← Back
            </button>
            <h1 className="text-xl font-semibold text-text-primary">Create a Team Room</h1>
            <p className="mt-1 mb-6 text-sm text-text-secondary">
              Give your workspace a name. A unique join code will be generated — share it with your team.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="room-name" className="mb-1.5 block text-sm text-text-secondary">
                  Room name
                </label>
                <input
                  id="room-name"
                  type="text"
                  autoFocus
                  required
                  minLength={2}
                  maxLength={80}
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="e.g. Flex Studios Core Team"
                  className="w-full rounded-md border border-border-default bg-surface-container px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {createError && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {createError}
                </p>
              )}
              <button
                type="submit"
                disabled={creating || roomName.trim().length < 2}
                className="h-10 w-full rounded-md bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create room"}
              </button>
            </form>
          </>
        )}

        {/* ── Step: created (show join code) ── */}
        {step === "created" && joinCode && (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Check size={22} className="text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-text-primary">Room created!</h1>
            <p className="mt-1 mb-6 text-sm text-text-secondary">
              Your Team Room is ready. Share the join code below with your team so they can join.
            </p>

            <div className="mb-4 rounded-lg border border-border-default bg-surface-container px-4 py-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">Join code</p>
              <div className="flex items-center gap-3">
                <code className="flex-1 break-all font-mono text-sm text-primary">{joinCode}</code>
                <button
                  onClick={copyCode}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border-default bg-surface-container-high text-text-secondary transition-colors hover:border-primary hover:text-primary"
                  title="Copy join code"
                >
                  {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <p className="mb-6 text-xs text-text-secondary">
              You can always find this code again under Team Rooms → room settings.
            </p>

            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              Go to Dashboard <ArrowRight size={15} />
            </button>
          </>
        )}

        {/* ── Step: join ── */}
        {step === "join" && (
          <>
            <button onClick={() => setStep("choice")} className="mb-4 text-xs text-text-secondary hover:text-text-primary">
              ← Back
            </button>
            <h1 className="text-xl font-semibold text-text-primary">Join a Team Room</h1>
            <p className="mt-1 mb-6 text-sm text-text-secondary">
              Enter the 32-character join code your team admin shared with you.
            </p>
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label htmlFor="join-code" className="mb-1.5 block text-sm text-text-secondary">
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
              {joinError && (
                <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {joinError}
                </p>
              )}
              <button
                type="submit"
                disabled={joining || code.trim().length !== 32}
                className="h-10 w-full rounded-md bg-primary text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joining ? "Joining…" : "Join room"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
