import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";
import { isBlobStorageConfigured, jobPhotoKey, putObject } from "@/lib/blob-storage";

// Client-side optimization shrinks uploads before they get here; this is a
// generous backstop, not the user-facing limit.
const MAX_BYTES = 4 * 1024 * 1024;
/**
 * Per-job ceiling. Before this, the only cap on photos was the preview-account
 * one, so an approved company could put unbounded 4MB blobs on a single job.
 * A hundred is far past documenting a real job and still bounded.
 */
const MAX_PHOTOS_PER_JOB = 100;
// No SVG: same-origin SVGs can carry scripts
const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const allowedPhotoTypes = ["BEFORE", "AFTER", "GENERAL"] as const;
type PhotoKind = (typeof allowedPhotoTypes)[number];

/**
 * POST — attach a photo to a job (multipart form: "file", optional "type"
 * BEFORE/AFTER/GENERAL, optional "caption"). Anyone who can see the job can
 * add photos — that's the tech in the driveway, not just the office.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Photos are DB-stored bytes (4MB each) — the one real storage cost a
  // preview account could rack up, so the total is capped pre-approval.
  if (await inPreview(actor.companyId)) {
    const n = await prisma.jobPhoto.count({ where: { job: { companyId: actor.companyId } } });
    if (n >= PREVIEW_CAP) return NextResponse.json(previewCapError("job photos"), { status: 403 });
  }
  const companyId = actor.companyId;

  const { id: jobId } = await params;
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId, ...jobScope(actor) } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const onJob = await prisma.jobPhoto.count({ where: { jobId } });
  if (onJob >= MAX_PHOTOS_PER_JOB) {
    return NextResponse.json(
      { error: `This job already has ${MAX_PHOTOS_PER_JOB} photos — delete one to add another.` },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPG, WebP, or GIF image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo is too large — try again." }, { status: 400 });
  }

  const rawType = formData.get("type");
  const type: PhotoKind = allowedPhotoTypes.includes(rawType as PhotoKind)
    ? (rawType as PhotoKind)
    : "GENERAL";
  const rawCaption = formData.get("caption");
  const caption =
    typeof rawCaption === "string" && rawCaption.trim() ? rawCaption.trim().slice(0, 200) : null;

  const bytes = Buffer.from(await file.arrayBuffer());

  // Create first so the row's id can name the object, then move the bytes out
  // to R2 and drop them from Postgres. If R2 isn't configured the bytes just
  // stay in the row, which is how this worked before object storage existed.
  const created = await prisma.jobPhoto.create({
    data: {
      jobId,
      type,
      caption,
      data: bytes,
      mimeType: file.type,
      sizeBytes: bytes.byteLength,
      url: "",
    },
  });

  let storageKey: string | null = null;
  if (isBlobStorageConfigured()) {
    const key = jobPhotoKey(companyId, jobId, created.id, file.type);
    try {
      await putObject(key, bytes, file.type);
      storageKey = key;
    } catch (err) {
      // Keep the upload rather than lose the tech's photo — it stays in
      // Postgres and the backfill script can move it later.
      console.error("[job-photos] R2 upload failed, keeping bytes in Postgres", err);
    }
  }

  const photo = await prisma.jobPhoto.update({
    where: { id: created.id },
    data: {
      // url points at the serving route — set after create so it carries the id
      url: `/api/job-photos/${created.id}`,
      ...(storageKey ? { storageKey, data: null } : {}),
    },
    select: { id: true, url: true, type: true, caption: true, createdAt: true },
  });

  return NextResponse.json(photo, { status: 201 });
}
