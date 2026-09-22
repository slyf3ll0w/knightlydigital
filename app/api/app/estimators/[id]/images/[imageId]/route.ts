import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { deleteObject, isBlobStorageConfigured } from "@/lib/blob-storage";

/** DELETE — remove a picture (the spec's reference is cleared by the editor). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, imageId } = await params;
  const row = await prisma.estimatorImage.findFirst({ where: { id: imageId, estimatorId: id, companyId: actor.companyId }, select: { id: true, storageKey: true } });
  if (!row) return NextResponse.json({ ok: true });
  await prisma.estimatorImage.delete({ where: { id: row.id } });
  if (row.storageKey && isBlobStorageConfigured()) {
    try {
      await deleteObject(row.storageKey);
    } catch (err) {
      console.error("[estimator-images] R2 delete failed", err);
    }
  }
  return NextResponse.json({ ok: true });
}
