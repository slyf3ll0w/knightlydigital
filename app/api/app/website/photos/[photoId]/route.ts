import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { deleteObject, isBlobStorageConfigured } from "@/lib/blob-storage";

const KINDS = new Set(["truck", "team", "shop", "work", "other"]);

/** PATCH { alt?, caption?, kind? } on a website photo upload. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { photoId } = await params;
  const photo = await prisma.websitePhoto.findFirst({
    where: { id: photoId, companyId: actor.companyId },
    select: { id: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: { alt?: string | null; caption?: string | null; kind?: string } = {};
  if (typeof body.alt === "string") data.alt = body.alt.trim().slice(0, 160) || null;
  if (typeof body.caption === "string") data.caption = body.caption.trim().slice(0, 300) || null;
  if (typeof body.kind === "string" && KINDS.has(body.kind)) data.kind = body.kind;
  await prisma.websitePhoto.update({ where: { id: photo.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { photoId } = await params;
  const photo = await prisma.websitePhoto.findFirst({
    where: { id: photoId, companyId: actor.companyId },
    select: { id: true, storageKey: true },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  await prisma.websitePhoto.delete({ where: { id: photo.id } });
  if (photo.storageKey && isBlobStorageConfigured()) {
    await deleteObject(photo.storageKey).catch((err) =>
      reportError("[website-photos] orphaned object in R2", { key: photo.storageKey, error: err })
    );
  }
  return NextResponse.json({ ok: true });
}
