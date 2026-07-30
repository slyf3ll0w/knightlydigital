import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { isBlobStorageConfigured, signedGetUrl } from "@/lib/blob-storage";

/**
 * Serve an uploaded job photo. Requires a signed-in member of the photo's
 * company — job photos (gate codes on doors, interiors) are not public the
 * way logos are.
 *
 * Two storage paths, one URL: photos in R2 answer with a redirect to a
 * short-lived presigned URL, so the bytes go browser↔R2 and never through
 * this server; photos still in Postgres stream from the row as before. The
 * authorization check above happens either way, before any URL is minted.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const actor = await getActor();
  if (!actor) return new NextResponse(null, { status: 401 });

  const { photoId } = await params;
  const photo = await prisma.jobPhoto.findFirst({
    where: { id: photoId, job: { companyId: actor.companyId } },
    select: { data: true, mimeType: true, storageKey: true },
  });
  if (!photo) return new NextResponse(null, { status: 404 });

  if (photo.storageKey && isBlobStorageConfigured()) {
    try {
      const url = await signedGetUrl(photo.storageKey);
      // Cache shorter than the signature's own lifetime, or a browser could
      // reuse a cached redirect to a URL that has already expired.
      return NextResponse.redirect(url, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=300" },
      });
    } catch (err) {
      console.error("[job-photos] signing failed", { photoId, error: err });
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
