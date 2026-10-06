import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager, jobScope } from "@/lib/permissions";
import { deleteObject, isBlobStorageConfigured } from "@/lib/blob-storage";

/**
 * PATCH { siteUse?, alt?, caption? } — "Use on website" (managers): the
 * photo joins the company's public site data and is served without auth
 * through /api/public/site-photos/[id]. Flagging confirms the client's
 * property may be shown; unflagging makes it private again at once.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: jobId, photoId } = await params;
  const photo = await prisma.jobPhoto.findFirst({
    where: { id: photoId, jobId, job: { companyId: actor.companyId, ...jobScope(actor) } },
    select: { id: true, siteUse: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: { siteUse?: boolean; alt?: string | null; caption?: string | null } = {};
  if (typeof body.siteUse === "boolean") {
    if (!isManager(actor.role)) return NextResponse.json({ error: "Only owners and admins can put photos on the website." }, { status: 403 });
    data.siteUse = body.siteUse;
  }
  if (typeof body.alt === "string") data.alt = body.alt.trim().slice(0, 160) || null;
  if (typeof body.caption === "string") data.caption = body.caption.trim().slice(0, 300) || null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await prisma.jobPhoto.update({ where: { id: photo.id }, data });
  if (data.siteUse !== undefined || photo.siteUse) {
    const { scheduleSiteRebuild } = await import("@/lib/website");
    scheduleSiteRebuild(actor.companyId, "job photo flagged");
  }
  return NextResponse.json({ ok: true });
}

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
      reportError("[job-photos] orphaned object in R2", { key: photo.storageKey, error: err })
    );
  }

  return NextResponse.json({ success: true });
}
