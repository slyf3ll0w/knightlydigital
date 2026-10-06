import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { isBlobStorageConfigured, putObject } from "@/lib/blob-storage";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_PHOTOS = 40;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const KINDS = new Set(["truck", "team", "shop", "work", "other"]);

function photoKey(companyId: string, id: string, mime: string): string {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime] ?? "bin";
  return `companies/${companyId}/website/${id}.${ext}`;
}

/**
 * POST — upload a photo FOR the website (multipart: file, kind, alt,
 * caption). Truck, team, shop front: things that are not on a job. Same
 * storage path as job photos (R2 when configured, else the bytes column).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = actor.companyId;

  const n = await prisma.websitePhoto.count({ where: { companyId } });
  if (n >= MAX_PHOTOS) {
    return NextResponse.json({ error: `You already have ${MAX_PHOTOS} site photos — remove one to add another.` }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photos must be under 6 MB." }, { status: 400 });

  const kindRaw = String(form.get("kind") ?? "other");
  const kind = KINDS.has(kindRaw) ? kindRaw : "other";
  const alt = String(form.get("alt") ?? "").trim().slice(0, 160) || null;
  const caption = String(form.get("caption") ?? "").trim().slice(0, 300) || null;
  const buffer = Buffer.from(await file.arrayBuffer());

  const created = await prisma.websitePhoto.create({
    data: { companyId, kind, alt, caption, mimeType: file.type, sizeBytes: buffer.byteLength, sort: n },
    select: { id: true },
  });

  if (isBlobStorageConfigured()) {
    try {
      const key = photoKey(companyId, created.id, file.type);
      await putObject(key, buffer, file.type);
      await prisma.websitePhoto.update({ where: { id: created.id }, data: { storageKey: key } });
    } catch (err) {
      reportError("[website-photos] R2 upload failed, keeping bytes in the database", { id: created.id, error: err });
      await prisma.websitePhoto.update({ where: { id: created.id }, data: { data: buffer } });
    }
  } else {
    await prisma.websitePhoto.update({ where: { id: created.id }, data: { data: buffer } });
  }

  return NextResponse.json({
    ok: true,
    photo: {
      id: created.id,
      url: `/api/public/site-photos/${created.id}`,
      alt: alt ?? "",
      caption: caption ?? "",
      kind,
      source: "upload",
    },
  });
}
