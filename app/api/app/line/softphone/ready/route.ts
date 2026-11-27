import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { wakeSoftphoneLeg } from "@/lib/voice";
import { membershipOf, siblingMembershipFor, VOIP_WAKE_SECS } from "@/lib/voip";
import type { PhoneDevice } from "@/lib/softphone";

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
 * start switching before its softphone has even registered. A phone's
 * native engine instead registers AS that membership and asks again with
 * `membership` set (its session stays as it was; only the SIP leg moves).
 * `device` names which phone credential to dial ("ios" when absent — the
 * iPhone builds in the field send none; the Android engine sends "android").
 *
 * POST { catchUp: true } — no call named (ticket #8ld9vq). The phone app's
 * page asks this whenever its engine comes up registered with no call on
 * it: "is something ringing for my company that I should have?" A push that
 * reached a phone whose engine could not sign in (a cold launch reads no
 * cookies and the build in the field ends the system call screen on that
 * 401) left the caller on ringback with no leg ever dialed to the phone,
 * though the person had the app open seconds later. The newest call still
 * inside its wake window, unanswered and not yet handed to the cell, is
 * dialed to this phone now; its INVITE rings the system screen by itself.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { callId?: unknown; probe?: unknown; membership?: unknown; device?: unknown; catchUp?: unknown };
  const device: PhoneDevice = body.device === "android" ? "android" : "ios";
  const headers = { "Cache-Control": "no-store" };
  if (body.catchUp === true) {
    if (!canSell(actor.role)) return NextResponse.json({ outcome: "none" }, { headers });
    const waiting = await prisma.call.findFirst({
      where: {
        companyId: actor.companyId,
        direction: "INBOUND",
        status: "RINGING",
        agentCallId: null,
        appRingAt: { gte: new Date(Date.now() - VOIP_WAKE_SECS * 1000) },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!waiting) return NextResponse.json({ outcome: "none" }, { headers });
    const outcome = await wakeSoftphoneLeg(actor.id, actor.companyId, waiting.id, device);
    console.info(`[voice] catch-up call=${waiting.id} user=${actor.id} device=${device} → ${outcome}`);
    return NextResponse.json({ outcome, callId: waiting.id }, { headers });
  }
  const callId = typeof body.callId === "string" ? body.callId : "";
  if (!callId) return NextResponse.json({ error: "callId required." }, { status: 400 });

  const call = await prisma.call.findUnique({ where: { id: callId }, select: { companyId: true } });
  // The whole wake path is otherwise silent in the server log; one line per
  // ask is what lets a phone that "answered but stayed on ringback" be read.
  const answer = (o: Record<string, unknown>) => {
    console.info(`[voice] ready call=${callId} user=${actor.id} probe=${body.probe === true} membership=${typeof body.membership === "string" ? body.membership : "-"} → ${JSON.stringify(o)}`);
    return NextResponse.json(o, { headers });
  };
  if (!call) return answer({ outcome: "late" });
  if (typeof body.membership === "string" && body.membership !== actor.id) {
    const as = await membershipOf(actor.id, body.membership);
    if (!as || as.companyId !== call.companyId) return answer({ outcome: "ineligible" });
    return answer({ outcome: await wakeSoftphoneLeg(as.id, as.companyId, callId, device) });
  }
  if (call.companyId !== actor.companyId) {
    const target = await siblingMembershipFor(actor.id, call.companyId);
    return answer(target ? { outcome: "switch", userId: target.id, companyName: target.companyName } : { outcome: "ineligible" });
  }
  if (!canSell(actor.role)) return answer({ outcome: "ineligible" });
  if (body.probe === true) return answer({ outcome: "same" });
  return answer({ outcome: await wakeSoftphoneLeg(actor.id, actor.companyId, callId, device) });
}
