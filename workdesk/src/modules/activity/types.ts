// ─────────────────────────────────────────────────────────────────────────────
// Activity Module Types
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityEventType =
  | "ARTIFACT_CREATED"
  | "ARTIFACT_UPDATED"
  | "ARTIFACT_DELETED"
  | "ARTIFACT_RESTORED"
  | "VERSION_COMMITTED"
  | "VERSION_RESTORED"
  | "SET_CREATED"
  | "SET_UPDATED"
  | "SET_DELETED"
  | "SET_RESTORED"
  | "ARTIFACT_SHARED"
  | "ARTIFACT_SHARE_REVOKED"
  | "BULLETIN_POSTED"
  | "COUNTDOWN_ASSIGNED"
  | "COUNTDOWN_COMPLETED";

export interface ActivityEvent {
  id: string;
  userId: string;
  eventType: ActivityEventType;
  artifactId: string | null;
  setId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
  /** Denormalized: artifact title or set name at time of query */
  title?: string;
}

export interface RecentlyOpenedItem {
  artifactId: string;
  title: string;
  type: string;
  openedAt: Date;
  openCount: number;
}

export interface EmitActivityPayload {
  userId: string;
  eventType: ActivityEventType;
  artifactId?: string | null;
  setId?: string | null;
  details?: Record<string, unknown>;
}

export interface EmitActivityPayloadWithRoom extends EmitActivityPayload {
  roomId: string;
}
