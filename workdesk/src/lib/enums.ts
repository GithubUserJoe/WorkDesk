// ─────────────────────────────────────────────────────────────────────────────
// Domain enums (hand-rolled — replaces @prisma/client enum exports).
//
// These mirror the PostgreSQL enum types defined in migrations/0001_baseline.sql.
// Kept as const objects + union types so they're usable both as values and types.
// ─────────────────────────────────────────────────────────────────────────────

export const Role = {
  MEMBER: "MEMBER",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ArtifactType = {
  TEXT: "TEXT",
  PDF: "PDF",
  DOCX: "DOCX",
  PPTX: "PPTX",
  IMAGE: "IMAGE",
  ZIP: "ZIP",
  OTHER: "OTHER",
} as const;
export type ArtifactType = (typeof ArtifactType)[keyof typeof ArtifactType];

export const Visibility = {
  PRIVATE: "PRIVATE",
  SHARED: "SHARED",
  PUBLIC: "PUBLIC",
} as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const AuditAction = {
  USER_CREATED: "USER_CREATED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_ACTIVATED: "USER_ACTIVATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  EMAIL_CHANGED: "EMAIL_CHANGED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  OWNERSHIP_TRANSFERRED: "OWNERSHIP_TRANSFERRED",
  ARTIFACT_VISIBILITY_CHANGED: "ARTIFACT_VISIBILITY_CHANGED",
  LIBRARY_SECTION_DELETED: "LIBRARY_SECTION_DELETED",
  SET_DELETED: "SET_DELETED",
  SET_CREATED: "SET_CREATED",
  SET_UPDATED: "SET_UPDATED",
  ARTIFACT_CREATED: "ARTIFACT_CREATED",
  ARTIFACT_UPDATED: "ARTIFACT_UPDATED",
  ARTIFACT_DELETED: "ARTIFACT_DELETED",
  ARTIFACT_VERSION_COMMITTED: "ARTIFACT_VERSION_COMMITTED",
  ARTIFACT_VERSION_RESTORED: "ARTIFACT_VERSION_RESTORED",
  ARTIFACT_SHARED: "ARTIFACT_SHARED",
  ARTIFACT_SHARE_REVOKED: "ARTIFACT_SHARE_REVOKED",
  BULLETIN_CREATED: "BULLETIN_CREATED",
  BULLETIN_DELETED: "BULLETIN_DELETED",
  BULLETIN_PINNED: "BULLETIN_PINNED",
  COUNTDOWN_COMPLETED: "COUNTDOWN_COMPLETED",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const RoomMemberRole = {
  OWNER: "OWNER",
  MEMBER: "MEMBER",
} as const;
export type RoomMemberRole = (typeof RoomMemberRole)[keyof typeof RoomMemberRole];

export const BulletinType = {
  ANNOUNCEMENT: "ANNOUNCEMENT",
  COUNTDOWN: "COUNTDOWN",
} as const;
export type BulletinType = (typeof BulletinType)[keyof typeof BulletinType];

export const CountdownStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  OVERDUE: "OVERDUE",
  INCOMPLETE: "INCOMPLETE",
} as const;
export type CountdownStatus = (typeof CountdownStatus)[keyof typeof CountdownStatus];
