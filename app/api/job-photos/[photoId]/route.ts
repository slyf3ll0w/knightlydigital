import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isBlobStorageConfigured, signedGetUrl, getObjectBytes, wantsBytes } from "@/lib/blob-storage";

/**
 * Serve an uploaded photo. Requires a signed-in member of the photo's
 * company — job photos (gate codes on doors, interiors) are not public the
 * way logos are. `?size=thumb` serves the 400 px copy when there is one
 * (grids and feeds); the full photo otherwise.
 *
 * Two storage paths, one URL: photos in R2 answer with a redirect to a
 * short-lived presigned URL, so the bytes go browser↔R2 and never through
 * this server; photos still in Postgres stream from the row as before. The
 * authorization check above happens either way, before any URL is minted.
 * A script's fetch() (CORS mode) can't follow the redirect, so it gets the
 * bytes through us (wantsBytes).
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
    select: { data: true, mimeType: true, storageKey: true, thumbKey: true },
  });
  if (!photo) return new NextResponse(null, { status: 404 });

  const wantThumb = req.nextUrl.searchParams.get("size") === "thumb";
  const key = wantThumb && photo.thumbKey ? photo.thumbKey : photo.storageKey;
  const mime = wantThumb && photo.thumbKey ? "image/jpeg" : photo.mimeType;

  if (key && isBlobStorageConfigured()) {
    try {
      if (wantsBytes(req.headers)) {
        const bytes = await getObjectBytes(key);
        if (bytes && mime) {
          return new NextResponse(bytes, {
            headers: {
              "Content-Type": mime,
              "Cache-Control": "private, max-age=3600",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
      }
      const url = await signedGetUrl(key);
      // Cache shorter than the signature's own lifetime, or a browser could
      // reuse a cached redirect to a URL that has already expired.
      return NextResponse.redirect(url, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=300" },
      });
    } catch (err) {
      reportError("[job-photos] signing failed", { photoId, error: err });
      // Fall through: a photo mid-migration may still have its bytes here.
    }
  }

  if (!photo.data || !photo.mimeType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Buffer.from(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
