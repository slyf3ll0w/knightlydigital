import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { photoResponse } from "@/lib/photos";

/**
 * Serve an uploaded photo. Requires a signed-in member of the photo's
 * company — job photos (gate codes on doors, interiors) are not public the
 * way logos are. `?size=thumb` serves the 400 px copy when there is one
 * (grids and feeds); the full photo otherwise. The client's copy of a photo
 * goes through /hub/[token]/photos/[photoId] (client-visible rows only).
 *
 * The authorization check happens here, before any URL is minted; the two
 * storage paths (R2 redirect / Postgres bytes) live in lib/photos.ts
 * photoResponse.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const actor = await getActor();
  if (!actor) return new NextResponse(null, { status: 401 });

  const { photoId } = await params;
  const photo = await prisma.jobPhoto.findFirst({
    // companyId is stamped on every row (backfill-photo-owners); the job
    // fallback only matters for a row the backfill has not reached yet.
    where: {
      id: photoId,
      OR: [{ companyId: actor.companyId }, { companyId: null, job: { companyId: actor.companyId } }],
    },
    select: { id: true, data: true, mimeType: true, storageKey: true, thumbKey: true },
  });
  if (!photo) return new NextResponse(null, { status: 404 });

  return photoResponse(req, photo, req.nextUrl.searchParams.get("size") === "thumb");
}
