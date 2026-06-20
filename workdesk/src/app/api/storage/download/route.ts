import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { verifyContentKeyReference, InvalidContentKeyError } from "@/modules/archive/services/archiveService";
import { DownloadQuerySchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/storage/download
//
// Returns a presigned GET URL for an R2 object referenced by a version record.
// Validates namespace ownership and DB linkage before signing.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;

    const parsed = DownloadQuerySchema.safeParse({
      contentKey: searchParams.get("contentKey"),
    });
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query parameters.", parsed.error.format()), {
        status: 400,
      });
    }

    await verifyContentKeyReference(session.userId, parsed.data.contentKey);
    const downloadUrl = await getPresignedDownloadUrl(parsed.data.contentKey);

    return NextResponse.json(
      ok({
        downloadUrl,
        contentKey: parsed.data.contentKey,
      })
    );
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof InvalidContentKeyError) {
      return NextResponse.json(fail(err.code, err.message), { status: 403 });
    }
    console.error("[StorageDownload] Failed to generate presigned download URL:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
