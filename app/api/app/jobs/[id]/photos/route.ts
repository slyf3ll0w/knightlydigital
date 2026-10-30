import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { parseUpload, storePhoto } from "@/lib/photos";

/**
 * POST — attach a photo to this job (multipart form: "file", optional "type"
 * BEFORE/DURING/AFTER/GENERAL, "caption", "thumb", capture stamps). The
 * per-job form of POST /api/app/photos; both run lib/photos.ts storePhoto.
 * Anyone who can see the job can add photos — that's the tech in the
 * driveway, not just the office.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: jobId } = await params;
  const parsed = await parseUpload(await req.formData(), { jobId });
  if (!parsed.ok) return parsed.response;
  const stored = await storePhoto(actor, parsed.input);
  if (!stored.ok) return stored.response;
  return NextResponse.json(stored.photo, { status: stored.status });
}
