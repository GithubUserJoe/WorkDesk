// ─────────────────────────────────────────────────────────────────────────────
// Sharing Module Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShareGrant {
  id: string;
  artifactId: string;
  ownerId: string;
  granteeId: string;
  granteeName: string;
  granteeEmail: string;
  createdAt: Date;
}

/** Artifact summary enriched with who shared it with you. */
export interface SharedArtifactSummary {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  type: string;
  ownerId: string;
  ownerName: string;
  setId: string | null;
  createdAt: Date;
  updatedAt: Date;
  sharedAt: Date;
}

/** Outgoing share — artifact the current user shared with a grantee. */
export interface OutgoingShare {
  shareId: string;
  artifactId: string;
  artifactTitle: string;
  artifactType: string;
  granteeId: string;
  granteeName: string;
  granteeEmail: string;
  sharedAt: Date;
}
