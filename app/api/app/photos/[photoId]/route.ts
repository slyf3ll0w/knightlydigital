import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { deletePhoto, parsePatch, patchPhoto } from "@/lib/photos";

/**
 * PATCH { caption?, type?, clientVisible?, siteUse?, alt?, pairWith? } — a
 * photo's words, stage, who may see it, and its before/after pair. The
 * answer is the photo; `also` carries any other photo whose pair changed.
 * DELETE removes it and its objects. Scoped by lib/photos.ts photoScope
 * (techs: their jobs; sales: their leads).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { photoId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await patchPhoto(actor, photoId, parsePatch(body));
  if (!result.ok) return result.response;
  return NextResponse.json({ ...result.photo, also: result.also });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { photoId } = await params;
  const result = await deletePhoto(actor, photoId);
  if (!result.ok) return result.response;
  return NextResponse.json({ success: true });
}
