import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { photoResponse } from "@/lib/photos";
import { clientMayOpenReport } from "@/lib/job-report";

/**
 * A client's copy of one of their photos (Gallery plan, phase B). The hub
 * token is the credential; the photo must be theirs, on a finished job the
 * company may report on, and either marked "client sees it" or the Before
 * half of a pair whose After is. Everything else is a plain 404 — a hidden
 * photo and a stranger's photo look the same from outside.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  const { token, photoId } = await params;
  const contact = await prisma.contact.findUnique({ where: { hubToken: token }, select: { id: true, companyId: true } });
  if (!contact) return new NextResponse(null, { status: 404 });

  const photo = await prisma.jobPhoto.findFirst({
    where: { id: photoId, contactId: contact.id, companyId: contact.companyId, jobId: { not: null } },
    select: {
      id: true, data: true, mimeType: true, storageKey: true, thumbKey: true,
      clientVisible: true, pairId: true,
      job: { select: { status: true } },
    },
  });
  if (!photo || !photo.job) return new NextResponse(null, { status: 404 });
  if (!(await clientMayOpenReport(contact.companyId, photo.job))) return new NextResponse(null, { status: 404 });

  let visible = photo.clientVisible;
  if (!visible && photo.pairId) {
    const shownAfter = await prisma.jobPhoto.count({ where: { pairId: photo.pairId, type: "AFTER", clientVisible: true } });
    visible = shownAfter > 0;
  }
  if (!visible) return new NextResponse(null, { status: 404 });

  return photoResponse(req, photo, req.nextUrl.searchParams.get("size") === "thumb");
}
