import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { getActor, canSell } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { SoftphoneError, issueSoftphoneGrant } from "@/lib/softphone";
import { membershipOf, VOIP_WAKE_SECS } from "@/lib/voip";
import { prisma } from "@/lib/db";
import { isNativeShellUserAgent } from "@/lib/sign-in-options";
import { SOFTPHONE_ROLES } from "@/lib/softphone";

/**
 * GET — what the browser softphone (components/Softphone.tsx) needs to
 * register with Telnyx: a short-lived JWT + the SIP username, or
 * `{ off: reason }` when calls shouldn't ring in this browser (no routed
 * line, add-on lapsed, the user switched it off in My Profile, …). Minted
 * per page load, nothing is stored client-side. Rate-limited because every
 * grant is a Telnyx round trip (and the first one creates resources).
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) {
    // A phone app woken by a call's push asks before iOS has loaded its
    // cookie jar: the request carries no cookies at all. That is not
    // "signed out", but iPhone build 15 reads a 401 as signed out and ends
    // the call screen (ticket #8ld9vq). Any other status leaves the call
    // ringing, and the engine asks again once the page has loaded with the
    // sign-in. A phone that really is signed out still sends its other
    // cookies, so it keeps getting 401.
    const d = req.nextUrl.searchParams.get("device");
    if ((d === "ios" || d === "android") && req.cookies.getAll().length === 0 && isNativeShellUserAgent(req.headers.get("user-agent"))) {
      console.info(`[softphone] grant asked with no cookies from the ${d} app; answering "too early" instead of 401`);
      return NextResponse.json({ error: "Not ready yet. Try again in a moment." }, { status: 425, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The iPhone's native engine may register as another membership of this
  // login, for a call of that company (lib/voip.ts membershipOf).
  const membership = req.nextUrl.searchParams.get("membership");
  const as = membership ? await membershipOf(actor.id, membership) : { id: actor.id, companyId: actor.companyId };
  if (!as) return NextResponse.json({ off: "role" });
  if (!membership && !canSell(actor.role)) return NextResponse.json({ off: "role" });
  // Generous: a healthy tab mints one per page load; the client backs off 3 min on a 429.
  if (!(await limit(`softphone-grant:${actor.id}`, 60, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many softphone connections in a row — give it a few minutes." }, { status: 429 });
  }
  try {
    // A phone app registers with its own credential (`device=ios` / `device=android`), never the browser's.
    const d = req.nextUrl.searchParams.get("device");
    const device = d === "ios" || d === "android" ? d : "browser";
    let grant: Awaited<ReturnType<typeof issueSoftphoneGrant>> | (Exclude<Awaited<ReturnType<typeof issueSoftphoneGrant>>, { off: string }> & { membership: string }) = await issueSoftphoneGrant(as.id, as.companyId, device);
    // The phone app is signed into a company whose line can't take calls (no
    // Voice plan, no line) while a call is ringing for ANOTHER company on the
    // same login: hand out that company's login instead. Build 15 ends the
    // call screen on any "off" answer; with this it registers, asks, is told
    // to switch, and rings (ticket #8ld9vq).
    if ("off" in grant && !membership && device !== "browser") {
      const sibling = await ringingSiblingMembership(actor.id);
      if (sibling) {
        const other = await issueSoftphoneGrant(sibling.id, sibling.companyId, device);
        if (!("off" in other)) {
          console.info(`[softphone] ${device} grant for user=${actor.id} was off (${(grant as { off: string }).off}); a call is ringing for membership=${sibling.id}, granting that`);
          grant = { ...other, membership: sibling.id };
        }
      }
    }
    return NextResponse.json(grant, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SoftphoneError) return NextResponse.json({ error: err.message }, { status: err.status });
    reportError("[softphone] grant failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

/**
 * Another membership of this login (same Account, can take calls) whose
 * company has an inbound call ringing right now, still inside the phone's
 * wake window and not yet answered or handed to the cell.
 */
async function ringingSiblingMembership(userId: string): Promise<{ id: string; companyId: string } | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { accountId: true } });
  if (!me?.accountId) return null;
  const siblings = await prisma.user.findMany({
    where: { accountId: me.accountId, id: { not: userId }, isActive: true, softphoneEnabled: true, role: { in: [...SOFTPHONE_ROLES] }, companyId: { not: null } },
    select: { id: true, companyId: true },
  });
  if (siblings.length === 0) return null;
  const call = await prisma.call.findFirst({
    where: {
      companyId: { in: siblings.map((s) => s.companyId!) },
      direction: "INBOUND",
      status: "RINGING",
      agentCallId: null,
      appRingAt: { gte: new Date(Date.now() - VOIP_WAKE_SECS * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { companyId: true },
  });
  const hit = call ? siblings.find((s) => s.companyId === call.companyId) : null;
  return hit ? { id: hit.id, companyId: hit.companyId! } : null;
}
