import { NextRequest, NextResponse } from "next/server";
import { requireActiveRoomSession, UnauthenticatedError, NoRoomError, NoActiveRoomError } from "@/lib/session";
import { updateArtifact, ArtifactNotFoundError, SetNotFoundError } from "@/modules/archive/services/archiveService";
import { IdParamSchema } from "@/modules/archive/schemas";
import { ok, fail } from "@/types/common";
import { z } from "zod";

const MoveSchema = z.object({
  setId: z.string().uuid("Target set ID must be a valid UUID."),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/archive/artifacts/[id]/move — move artifact to a different set
export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requireActiveRoomSession();
    const { id } = await params;

    const idParsed = IdParamSchema.safeParse({ id });
    if (!idParsed.success) {
      return NextResponse.json(fail("BAD_REQUEST", "Invalid artifact ID format."), { status: 400 });
    }

    const body: unknown = await req.json();
    const parsed = MoveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input.", parsed.error.format()), { status: 400 });
    }

    const artifact = await updateArtifact(session.userId, session.activeRoomId, idParsed.data.id, { setId: parsed.data.setId });
    return NextResponse.json(ok(artifact));
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json(fail(err.code, err.message), { status: 401 });
    if (err instanceof NoRoomError || err instanceof NoActiveRoomError) return NextResponse.json(fail(err.code, err.message), { status: 403 });
    if (err instanceof ArtifactNotFoundError || err instanceof SetNotFoundError) return NextResponse.json(fail(err.code, err.message), { status: 404 });
    console.error("[POST /api/archive/artifacts/[id]/move]", err);
    return NextResponse.json(fail("INTERNAL_ERROR", "Internal server error occurred."), { status: 500 });
  }
}
