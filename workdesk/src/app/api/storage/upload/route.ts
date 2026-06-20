import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireRoomSession } from "@/lib/session";
import { getPresignedUploadUrl } from "@/lib/storage";
import { buildArchiveContentKey } from "@/modules/archive/utils/contentKey";
import { UploadQuerySchemaV2 } from "@/modules/archive/schemas";
import { assertQuota, QuotaExceededError } from "@/modules/archive/services/storageService";
import { ok, fail } from "@/types/common";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/storage/upload
//
// Authenticates session, runs a soft quota check against the client-declared
// byteSize, then returns a presigned PUT URL + namespaced contentKey.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireRoomSession();
    const { searchParams } = req.nextUrl;

    const parsed = UploadQuerySchemaV2.safeParse({
      contentType: searchParams.get("contentType"),
      filename: searchParams.get("filename") ?? undefined,
      byteSize: searchParams.get("byteSize") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid query parameters.", parsed.error.format()), {
        status: 400,
      });
    }

    // Soft quota check (skipped if byteSize is 0 / not provided)
    await assertQuota(session.userId, parsed.data.byteSize);

    const key = buildArchiveContentKey(session.userId, parsed.data.filename);
    const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType);
    const local = process.env.USE_LOCAL_STORAGE === "true";

    return NextResponse.json(
      ok({
        uploadUrl,
        contentKey: key,
        local,
      })
    );
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthenticatedError") {
      return NextResponse.json(fail("UNAUTHENTICATED", "Authentication required."), { status: 401 });
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(fail(err.code, err.message), { status: 413 });
    }
    console.error("[StorageUpload] Failed to generate presigned upload ticket:", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
