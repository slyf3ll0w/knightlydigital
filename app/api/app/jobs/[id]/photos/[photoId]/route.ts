import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

/** DELETE — remove a photo from a job (anyone who can see the job). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = actor.companyId;

  const { id: jobId, photoId } = await params;
  const photo = await prisma.jobPhoto.findFirst({
    where: { id: photoId, jobId, job: { companyId, ...jobScope(actor) } },
    select: { id: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  await prisma.jobPhoto.delete({ where: { id: photo.id } });
  return NextResponse.json({ success: true });
}
