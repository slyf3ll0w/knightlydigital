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
    return answer({ outcome: await wakeSoftphoneLeg(as.id, as.companyId, callId) });
  }
  if (call.companyId !== actor.companyId) {
    const target = await siblingMembershipFor(actor.id, call.companyId);
    return answer(target ? { outcome: "switch", userId: target.id, companyName: target.companyName } : { outcome: "ineligible" });
  }
  if (!canSell(actor.role)) return answer({ outcome: "ineligible" });
  if (body.probe === true) return answer({ outcome: "same" });
  return answer({ outcome: await wakeSoftphoneLeg(actor.id, actor.companyId, callId) });
}
