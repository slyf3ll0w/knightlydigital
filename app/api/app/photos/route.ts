import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { parseUpload, storePhoto } from "@/lib/photos";

/**
 * POST — add a photo to a job or a quote (multipart form: "file", optional
 * "thumb" 400 px JPEG, "jobId" or "quoteId", optional "type", "caption",
 * "takenAt", "lat" / "lng" / "accuracy", "clientKey", "pairWith"). Anyone who
 * can see the job can add photos to it; a photo on a quote, and a pair, are
 * Gallery-plan features. The answer is the photo; `also` carries the Before
 * it was paired with. See lib/photos.ts.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseUpload(await req.formData());
  if (!parsed.ok) return parsed.response;
  const stored = await storePhoto(actor, parsed.input);
  if (!stored.ok) return stored.response;
  return NextResponse.json({ ...stored.photo, also: stored.also }, { status: stored.status });
}
