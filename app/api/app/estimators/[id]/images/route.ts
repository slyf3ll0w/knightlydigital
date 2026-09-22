import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { isBlobStorageConfigured, putObject } from "@/lib/blob-storage";

/**
 * POST multipart { file } — a picture for one of this tool's questions or
 * options (the editor's "Add picture"). Same storage scheme as job photos:
 * the row is created first so its id names the R2 object; without R2 the
 * bytes stay in the row. Returns the URL the spec stores
 * (/api/estimate-images/[id]), which is public — these render on the
 * website form.
 */
const MAX_BYTES = 2 * 1024 * 1024; // the editor downsizes to ~1024 px JPEG first
const MAX_PER_TOOL = 60;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const tool = await prisma.estimator.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((await prisma.estimatorImage.count({ where: { estimatorId: tool.id } })) >= MAX_PER_TOOL) {
    return NextResponse.json({ error: `This tool already has ${MAX_PER_TOOL} pictures — remove one first.` }, { status: 400 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a JPG, PNG, WebP or GIF." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That picture is too large — try a smaller one." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());

  const row = await prisma.estimatorImage.create({
    data: { companyId: actor.companyId, estimatorId: tool.id, mimeType: file.type, sizeBytes: bytes.byteLength, data: bytes },
    select: { id: true },
  });
  if (isBlobStorageConfigured()) {
    try {
      const key = `companies/${actor.companyId}/estimators/${tool.id}/${row.id}.${EXT[file.type] ?? "bin"}`;
      await putObject(key, bytes, file.type);
      await prisma.estimatorImage.update({ where: { id: row.id }, data: { storageKey: key, data: null } });
    } catch (err) {
      console.error("[estimator-images] R2 upload failed; bytes stay in Postgres", err);
    }
  }
  return NextResponse.json({ id: row.id, url: `/api/estimate-images/${row.id}` }, { status: 201 });
}
