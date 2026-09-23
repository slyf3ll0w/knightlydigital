import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { wakeSoftphoneLeg } from "@/lib/voice";

/**
 * POST { callId } — "I'm awake for this call." The iPhone app was rung by
 * a VoIP push (lib/voip.ts) while it was closed; CallKit is showing the
 * call, the app has loaded and its softphone is registered, and now it can
 * be dialed. lib/voice.ts dials the SIP leg if the call is still ringing
 * and nobody has picked it up — otherwise says so, and the app dismisses
 * the system call screen.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { callId?: unknown };
  const callId = typeof body.callId === "string" ? body.callId : "";
  if (!callId) return NextResponse.json({ error: "callId required." }, { status: 400 });
  const outcome = await wakeSoftphoneLeg(actor.id, actor.companyId, callId);
  return NextResponse.json({ outcome }, { headers: { "Cache-Control": "no-store" } });
}
