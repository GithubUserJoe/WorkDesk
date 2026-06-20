import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireSession, requireRoomSession, UnauthenticatedError, NoRoomError } from "@/lib/session";
import { commitVersion, getArtifactDetails, ArtifactNotFoundError, updateArtifactFtsContent } from "@/modules/archive/services/archiveService";
import { ok, fail } from "@/types/common";
import { z } from "zod";
import { getPresignedDownloadUrl } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────────
// Text content API — only for TYPE=TEXT artifacts.
//
// GET  /api/archive/artifacts/[id]/content?versionNumber=N
//   Returns the Tiptap JSON document for version N (defaults to head).
//   Reads from local uploads/ or fetches from R2 depending on backend.
//
// PUT  /api/archive/artifacts/[id]/content
//   Body: { doc: TiptapJSON, changeSummary?: string }
//   Writes the JSON to storage, then commits a new version.
//   For local-fs: writes directly to uploads/. For R2: would need server-side S3 PUT.
//   In V1 this is local-only — R2 path requires a small follow-up when creds arrive.
// ─────────────────────────────────────────────────────────────────────────────

const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
const USE_LOCAL = process.env.USE_LOCAL_STORAGE === "true";

const SaveSchema = z.object({
  doc: z.record(z.string(), z.unknown()),
  changeSummary: z.string().max(255).optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: artifactId } = await params;

    // allowShared=true: grantees can read text content too.
    const artifact = await getArtifactDetails(session.userId, artifactId, true);
    if (artifact.type !== "TEXT") {
      return NextResponse.json(fail("NOT_TEXT", "Content API is only available for TEXT artifacts."), { status: 400 });
    }

    const versionParam = req.nextUrl.searchParams.get("versionNumber");
    const versions = artifact.versions; // newest-first
    if (versions.length === 0) {
      return NextResponse.json(ok(null), { status: 200 });
    }

    let targetVersion = versions[0]; // head
    if (versionParam) {
      const num = parseInt(versionParam, 10);
      const found = versions.find((v) => v.versionNumber === num);
      if (!found) return NextResponse.json(fail("VERSION_NOT_FOUND", "Version not found."), { status: 404 });
      targetVersion = found;
    }

    const content = await readTextContent(targetVersion.contentKey);
    return NextResponse.json(ok(content), { status: 200 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[GET /api/archive/artifacts/[id]/content]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { id: artifactId } = await params;

    const artifact = await getArtifactDetails(session.userId, artifactId);
    if (artifact.type !== "TEXT") {
      return NextResponse.json(fail("NOT_TEXT", "Content API is only available for TEXT artifacts."), { status: 400 });
    }

    const body: unknown = await req.json();
    const parsed = SaveSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.flatten()), { status: 400 });

    const contentKey = `archives/${session.userId}/${crypto.randomUUID()}-document.json`;
    const jsonBytes = Buffer.from(JSON.stringify(parsed.data.doc), "utf8");

    await writeTextContent(contentKey, jsonBytes);

    const version = await commitVersion(session.userId, artifactId, {
      contentKey,
      changeSummary: parsed.data.changeSummary ?? null,
      byteSize: jsonBytes.byteLength,
    });

    // Update FTS index with plain text extracted from the document (best-effort).
    const plainText = extractPlainText(parsed.data.doc);
    updateArtifactFtsContent(session.userId, artifactId, plainText).catch((e) =>
      console.error("[content PUT] FTS update failed:", e)
    );

    return NextResponse.json(ok(version), { status: 201 });
  } catch (err) {
    if (err instanceof NoRoomError)
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof UnauthenticatedError)
      return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof ArtifactNotFoundError)
      return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[PUT /api/archive/artifacts/[id]/content]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "An unexpected error occurred."), { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain-text extraction for FTS indexing
// ─────────────────────────────────────────────────────────────────────────────

function extractNodeText(node: Record<string, unknown>): string {
  if (node.type === "text") return (node.text as string) ?? "";
  if (node.type === "hardBreak") return "\n";
  const children = (node.content as Array<Record<string, unknown>>) ?? [];
  const text = children.map(extractNodeText).join("");
  const blockTypes = new Set(["paragraph","heading","blockquote","codeBlock","bulletList","orderedList","listItem","taskList","taskItem"]);
  return (node.type && blockTypes.has(node.type as string)) ? text + "\n" : text;
}

function extractPlainText(doc: Record<string, unknown>): string {
  try { return extractNodeText(doc).replace(/\n{3,}/g, "\n\n").trim(); } catch { return ""; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage helpers (local-fs for now; R2 path is a TODO when creds arrive)
// ─────────────────────────────────────────────────────────────────────────────

async function writeTextContent(contentKey: string, data: Buffer): Promise<void> {
  if (!USE_LOCAL) {
    // R2: upload via S3 PutObject (server-side). Placeholder until R2 creds added.
    throw new Error("Server-side R2 write for text content is not yet implemented. Set USE_LOCAL_STORAGE=true.");
  }
  const filePath = path.resolve(UPLOADS_ROOT, contentKey);
  const dir = path.dirname(filePath);
  if (!dir.startsWith(UPLOADS_ROOT)) throw new Error("Path traversal rejected.");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, data);
}

async function readTextContent(contentKey: string): Promise<Record<string, unknown> | null> {
  if (USE_LOCAL) {
    const filePath = path.resolve(UPLOADS_ROOT, contentKey);
    if (!filePath.startsWith(UPLOADS_ROOT)) throw new Error("Path traversal rejected.");
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  }

  // R2: fetch via presigned GET and parse JSON
  const downloadUrl = await getPresignedDownloadUrl(contentKey);
  const res = await fetch(downloadUrl);
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}
