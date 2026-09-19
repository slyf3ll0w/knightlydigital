import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { voicemailUrl } from "@/lib/voice";

/**
 * GET → 302 to a short-lived MP3 URL for the call's voicemail. Recordings
 * stay at Telnyx (their download links expire, so nothing is cached here);
 * the <audio> element on /app/calls points at this route and follows the
 * redirect. Company-scoped like every call read.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const call = await prisma.call.findFirst({
    where: { id, companyId: actor.companyId },
    select: { voicemailRecordingId: true, customerLegId: true },
  });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const url = await voicemailUrl(call);
    if (!url) return NextResponse.json({ error: "No recording for this call." }, { status: 404 });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error("[voice] voicemail fetch failed:", err);
    return NextResponse.json({ error: "Couldn't fetch the recording right now." }, { status: 502 });
  }
}
