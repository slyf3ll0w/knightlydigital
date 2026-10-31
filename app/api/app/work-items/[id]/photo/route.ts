import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { deleteObject, isBlobStorageConfigured, putObject } from "@/lib/blob-storage";
import { storePhotoUrl } from "@/lib/store";
import { reportError } from "@/lib/report-error";

const MAX_BYTES = 6 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * POST /api/app/work-items/[id]/photo — the product's picture for the shop
 * page (multipart `file`: PNG, JPG or WebP, ≤ 6 MB). One per product; a new
 * upload replaces the old. Lives in blob storage (R2) — without it, no
 * photos (the editor says so). DELETE removes it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.workItem.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, photoKey: true } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  if (!isBlobStorageConfigured()) return NextResponse.json({ error: "Photo storage isn't set up on this server yet." }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (!EXT[file.type]) return NextResponse.json({ error: "Use a PNG, JPG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photos must be under 6 MB." }, { status: 400 });

  // A fresh key each time, so a browser cache of the old picture can't linger.
  const key = `companies/${actor.companyId}/products/${item.id}-${Date.now()}.${EXT[file.type]}`;
  try {
    await putObject(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    reportError("[work-items] photo upload failed", { id, error: err });
    return NextResponse.json({ error: "The photo didn't upload — try again." }, { status: 424 });
  }
  await prisma.workItem.update({ where: { id: item.id }, data: { photoKey: key, photoMime: file.type } });
  if (item.photoKey) deleteObject(item.photoKey).catch(() => {});
  return NextResponse.json({ photoUrl: `${storePhotoUrl({ id: item.id, photoKey: key })}?v=${Date.now()}` });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.workItem.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true, photoKey: true } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  await prisma.workItem.update({ where: { id: item.id }, data: { photoKey: null, photoMime: null } });
  if (item.photoKey) deleteObject(item.photoKey).catch(() => {});
  return NextResponse.json({ ok: true });
}
