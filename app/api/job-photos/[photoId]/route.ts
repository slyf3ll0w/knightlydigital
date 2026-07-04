import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * Serve an uploaded job photo. Requires a signed-in member of the photo's
 * company — job photos (gate codes on doors, interiors) are not public the
 * way logos are. Immutable-cached per id; uploads never change in place.
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
    select: { data: true, mimeType: true },
  });

  if (!photo?.data || !photo.mimeType) {
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
