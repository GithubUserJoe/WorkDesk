// LOCAL STORAGE ONLY — remove this file when switching back to R2.
//
// PUT /api/storage/local/archives/{userId}/{uuid}-{filename}
//   Receives raw file bytes from the client (upload.ts fetch PUT) and writes
//   them to uploads/{contentKey} relative to the project root.
//
// GET /api/storage/local/archives/{userId}/{uuid}-{filename}
//   Streams the file back to the client with the correct Content-Type.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { verifyContentKeyReference, InvalidContentKeyError } from "@/modules/archive/services/archiveService";
import { fail } from "@/types/common";

// Project root is three levels above src/app/api/storage/local/[...path]
// i.e. workdesk/  →  uploads/ lives here.
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

function resolveKey(segments: string[]): string | null {
  // segments = ["archives", userId, "uuid-filename"]
  const joined = segments.join("/");

  // Reject ".." and absolute paths.
  if (
    joined.includes("..") ||
    joined.startsWith("/") ||
    segments.some((s) => s === "" || s === "." || s === "..")
  ) {
    return null;
  }

  const resolved = path.resolve(UPLOADS_ROOT, joined);

  // Final containment check: resolved path must stay inside UPLOADS_ROOT.
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep) && resolved !== UPLOADS_ROOT) {
    return null;
  }

  return resolved;
}

// PUT — receive bytes, write to disk.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  // Auth: the PUT comes from the browser via upload.ts after the server issued
  // the ticket. Require a valid session so unauthenticated actors can't write.
  try {
    const session = await requireActiveRoomSession();
    const { path: segments } = await params;

    // Enforce ownership: segment[1] must be the session userId.
    // Format: archives/{userId}/{uuid}-{filename}
    if (!segments || segments.length < 3 || segments[0] !== "archives" || segments[1] !== session.userId) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const filePath = resolveKey(segments);
    if (!filePath) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const buffer = Buffer.from(await req.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[LocalStorage PUT]", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

// GET — stream file back to client.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { path: segments } = await params;

    if (!segments || segments.length < 3 || segments[0] !== "archives") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Build the content key from the path segments and verify DB linkage.
    // This allows cross-user access for PUBLIC and share-granted artifacts
    // without restricting by the file owner's userId in the path.
    const contentKey = segments.join("/");
    try {
      await verifyContentKeyReference(session.userId, contentKey);
    } catch (e) {
      if (e instanceof InvalidContentKeyError) {
        return new NextResponse("Forbidden", { status: 403 });
      }
      throw e;
    }

    const filePath = resolveKey(segments);
    if (!filePath) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse("Not found", { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const filename = segments[segments.length - 1];
    const cleanName = filename.replace(/^[0-9a-f-]{36}-/i, "");
    const ext = path.extname(cleanName).toLowerCase();

    // Inline-displayable types: serve with correct Content-Type so browsers can
    // render them directly (img src, iframe, etc.). Everything else is a download.
    const INLINE: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
    };
    const contentType = INLINE[ext] ?? "application/octet-stream";
    // `?download=1` forces a download even for previewable types — used by the
    // explicit Download button. Without it, previewable types render inline so
    // <img>/<iframe> can display them.
    const forceDownload = req.nextUrl.searchParams.get("download") === "1";
    const isInline = ext in INLINE && !forceDownload;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(isInline
          ? {}
          : { "Content-Disposition": `attachment; filename="${cleanName}"` }),
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    console.error("[LocalStorage GET]", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
