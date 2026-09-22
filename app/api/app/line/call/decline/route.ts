import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { VoiceError, declineCall } from "@/lib/voice";

/**
 * POST { id } — the Decline button in the browser softphone: the caller goes
 * straight to voicemail, like declining on a phone. Called BEFORE the browser
 * drops its SIP leg, because a browser leg that merely ends means "try the
 * cell next" (lib/voice.ts onHangup).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    return NextResponse.json(await declineCall(actor.companyId, body.id));
  } catch (err) {
    if (err instanceof VoiceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[voice] decline route error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
