import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { deleteObject, isBlobStorageConfigured } from "@/lib/blob-storage";

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
    select: { id: true, storageKey: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  await prisma.jobPhoto.delete({ where: { id: photo.id } });

  // Drop the object too, or deleted photos bill forever as orphans nothing
  // points at. The row is already gone, so a failure here is logged rather
  // than surfaced — the user's delete did happen.
  if (photo.storageKey && isBlobStorageConfigured()) {
    await deleteObject(photo.storageKey).catch((err) =>
      console.error("[job-photos] orphaned object in R2", { key: photo.storageKey, error: err })
    );
  }

  return NextResponse.json({ success: true });
}
