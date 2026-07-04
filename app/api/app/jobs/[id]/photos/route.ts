import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

// Client-side optimization shrinks uploads before they get here; this is a
// generous backstop, not the user-facing limit.
const MAX_BYTES = 4 * 1024 * 1024;
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
  const companyId = actor.companyId;

  const { id: jobId } = await params;
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId, ...jobScope(actor) } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

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

  const photo = await prisma.$transaction(async (tx) => {
    const created = await tx.jobPhoto.create({
      data: { jobId, type, caption, data: bytes, mimeType: file.type, url: "" },
    });
    // url points at the serving route — set after create so it carries the id
    return tx.jobPhoto.update({
      where: { id: created.id },
      data: { url: `/api/job-photos/${created.id}` },
      select: { id: true, url: true, type: true, caption: true, createdAt: true },
    });
  });

  return NextResponse.json(photo, { status: 201 });
}
