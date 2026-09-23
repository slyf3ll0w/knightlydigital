import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { wakeSoftphoneLeg } from "@/lib/voice";
import { membershipOf, siblingMembershipFor } from "@/lib/voip";

/**
 * POST { callId, probe? } — "I'm awake for this call." The iPhone app was
 * rung by a VoIP push (lib/voip.ts) while it was closed; CallKit is showing
 * the call, the app has loaded and its softphone is registered, and now it
 * can be dialed. lib/voice.ts dials the SIP leg if the call is still ringing
 * and nobody has picked it up — otherwise says so, and the app dismisses
 * the system call screen.
 *
 * The phone rings for every company on the login, so the call may belong to
 * a company the app is not signed into right now. Then the answer is
 * `switch` with the membership to move to: the app re-points its session
 * (lib/company-switch.ts), reloads as that company and asks again.
 * `probe: true` only asks that question — no leg is dialed — so the app can
 * start switching before its softphone has even registered. The iPhone's
 * native engine instead registers AS that membership and asks again with
 * `membership` set (its session stays as it was; only the SIP leg moves).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { callId?: unknown; probe?: unknown; membership?: unknown };
  const callId = typeof body.callId === "string" ? body.callId : "";
  if (!callId) return NextResponse.json({ error: "callId required." }, { status: 400 });
  const headers = { "Cache-Control": "no-store" };

  const call = await prisma.call.findUnique({ where: { id: callId }, select: { companyId: true } });
  if (!call) return NextResponse.json({ outcome: "late" }, { headers });
  if (typeof body.membership === "string" && body.membership !== actor.id) {
    const as = await membershipOf(actor.id, body.membership);
    if (!as || as.companyId !== call.companyId) return NextResponse.json({ outcome: "ineligible" }, { headers });
    return NextResponse.json({ outcome: await wakeSoftphoneLeg(as.id, as.companyId, callId) }, { headers });
  }
  if (call.companyId !== actor.companyId) {
    const target = await siblingMembershipFor(actor.id, call.companyId);
    return NextResponse.json(
      target ? { outcome: "switch", userId: target.id, companyName: target.companyName } : { outcome: "ineligible" },
      { headers }
    );
  }
  if (!canSell(actor.role)) return NextResponse.json({ outcome: "ineligible" }, { headers });
  if (body.probe === true) return NextResponse.json({ outcome: "same" }, { headers });
  const outcome = await wakeSoftphoneLeg(actor.id, actor.companyId, callId);
  return NextResponse.json({ outcome }, { headers });
}
