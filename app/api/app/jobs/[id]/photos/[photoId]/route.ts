import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { deletePhoto, parsePatch, patchPhoto } from "@/lib/photos";

/**
 * PATCH { caption?, type?, clientVisible?, siteUse?, alt? } / DELETE on one
 * of this job's photos. The per-job form of /api/app/photos/[photoId]; both
 * run lib/photos.ts. "Use on website" (siteUse) is managers only: the photo
 * joins the public site data and is served without auth through
 * /api/public/site-photos/[id]; unflagging makes it private again at once.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: jobId, photoId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await patchPhoto(actor, photoId, parsePatch(body), jobId);
  if (!result.ok) return result.response;
  return NextResponse.json({ ok: true, photo: result.photo });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: jobId, photoId } = await params;
  const result = await deletePhoto(actor, photoId, jobId);
  if (!result.ok) return result.response;
  return NextResponse.json({ success: true });
}
