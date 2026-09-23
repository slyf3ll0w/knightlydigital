import { prisma } from "@/lib/db";
import { apnsConfigured, sendVoipPush } from "@/lib/apns";
import { SOFTPHONE_ROLES } from "@/lib/softphone";

/**
 * Ringing the iPhone app when it is closed (tier 3 of
 * docs/plans/business-line-voice-2026-09-18.md).
 *
 * A registered browser is rung as a SIP leg the moment a call comes in
 * (lib/softphone.ts). A phone can't be: iOS suspends the webview in the
 * background, so its Telnyx registration is gone within seconds. Instead
 * the app registers a PushKit VoIP token (a PushSubscription row with
 * platform "ios-voip"), and an inbound call sends one VoIP push per
 * device. iOS wakes the app and shows the native call screen (CallKit)
 * right away; the app then loads, registers its softphone and POSTs
 * /api/app/line/softphone/ready, and only THEN is its SIP leg dialed
 * (lib/voice.ts wakeSoftphoneLeg). Meanwhile the caller hears ringback,
 * and if no phone wakes in time the cell rings exactly as before.
 *
 * Android is not here yet: it needs an FCM high-priority data message plus
 * a foreground service (queued in docs/plans/native-release-queue.md).
 */

export const VOIP_PLATFORM = "ios-voip";

/**
 * How long the caller waits for a pushed phone to wake, register and take its
 * SIP leg before the cell gets its turn. A cold start on cellular — launch,
 * load the site, fetch the softphone SDK, register with Telnyx — can take
 * 20–30 s, and a first test at 25 s lost the call to the cell mid-answer.
 * Ceiling: VoipPlugin.swift ends an unclaimed CallKit call at 45 s, and
 * wakeSoftphoneLeg allows this + 5 s, so stay under 40.
 */
export const VOIP_WAKE_SECS = 35;

export type VoipTarget = {
  /** The membership in the call's company that this phone answers as (its SIP leg, its call rows). */
  userId: string;
  tokens: string[];
  /** The login behind this phone has more than one company, so the system call screen names which one is ringing. */
  multiCompany: boolean;
};

/**
 * Every iPhone that should ring for this company's calls.
 *
 * A phone registers its VoIP token under whichever membership the app is
 * signed into, but a login can have several companies. The phone rings for
 * all of them: eligibility (active, softphone on, a role that takes calls)
 * is judged on the membership IN THIS COMPANY, and the token is found on any
 * membership of the same login. The app, woken by the push while signed
 * into a different company, switches itself over before it registers
 * (POST /api/app/line/softphone/ready answers "switch").
 */
export async function voipTargetsFor(companyId: string): Promise<VoipTarget[]> {
  if (!apnsConfigured()) return [];
  const members = await prisma.user.findMany({
    where: { companyId, isActive: true, softphoneEnabled: true, role: { in: [...SOFTPHONE_ROLES] } },
    select: { id: true, accountId: true },
  });
  if (members.length === 0) return [];
  const accountIds = [...new Set(members.flatMap((m) => (m.accountId ? [m.accountId] : [])))];
  const siblings = accountIds.length
    ? await prisma.user.findMany({
        where: { accountId: { in: accountIds }, isActive: true, companyId: { not: null } },
        select: { id: true, accountId: true },
      })
    : [];
  const memberByAccount = new Map(members.flatMap((m) => (m.accountId ? [[m.accountId, m.id] as const] : [])));
  const membershipsPerAccount = new Map<string, number>();
  for (const s of siblings) if (s.accountId) membershipsPerAccount.set(s.accountId, (membershipsPerAccount.get(s.accountId) ?? 0) + 1);
  const rows = await prisma.pushSubscription.findMany({
    where: { platform: VOIP_PLATFORM, userId: { in: [...new Set([...members.map((m) => m.id), ...siblings.map((s) => s.id)])] } },
    select: { endpoint: true, user: { select: { id: true, accountId: true } } },
  });
  const byUser = new Map<string, VoipTarget>();
  for (const r of rows) {
    const local = members.some((m) => m.id === r.user.id) ? r.user.id : r.user.accountId ? memberByAccount.get(r.user.accountId) : undefined;
    if (!local) continue;
    const multiCompany = Boolean(r.user.accountId && (membershipsPerAccount.get(r.user.accountId) ?? 0) > 1);
    const t = byUser.get(local) ?? { userId: local, tokens: [], multiCompany };
    t.tokens.push(r.endpoint);
    byUser.set(local, t);
  }
  return [...byUser.values()];
}

/**
 * `userId` as one of this signed-in person's own memberships (the same
 * Account, active, able to take calls) — or null. The iPhone's native engine
 * acts as a sibling membership for a call of another company on the login
 * (GET …/softphone?membership=, POST …/softphone/ready { membership }).
 */
export async function membershipOf(actorId: string, userId: string): Promise<{ id: string; companyId: string } | null> {
  if (userId === actorId) {
    const me = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, companyId: true } });
    return me?.companyId ? { id: me.id, companyId: me.companyId } : null;
  }
  const me = await prisma.user.findUnique({ where: { id: actorId }, select: { accountId: true } });
  if (!me?.accountId) return null;
  const u = await prisma.user.findFirst({
    where: { id: userId, accountId: me.accountId, isActive: true, softphoneEnabled: true, role: { in: [...SOFTPHONE_ROLES] }, companyId: { not: null } },
    select: { id: true, companyId: true },
  });
  return u?.companyId ? { id: u.id, companyId: u.companyId } : null;
}

/**
 * The iPhone app's native engine registers with the same SIP credential the
 * browser would, but sends no presence heartbeat (the app may be asleep the
 * moment before a call is placed and registers on demand). A phone with a
 * VoIP token on this login counts as reachable for an outbound call from
 * the app: the INVITE for its own call is what wakes it.
 */
export async function voipRegisteredSoftphone(userId: string): Promise<{ sipUsername: string } | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { sipUsername: true, softphoneEnabled: true, accountId: true } });
  if (!u?.sipUsername || !u.softphoneEnabled) return null;
  const token = await prisma.pushSubscription.findFirst({
    where: { platform: VOIP_PLATFORM, OR: [{ userId }, ...(u.accountId ? [{ user: { accountId: u.accountId } }] : [])] },
    select: { id: true },
  });
  return token ? { sipUsername: u.sipUsername } : null;
}

/**
 * The membership this signed-in person should switch to for a call that
 * belongs to another of their companies — or null if they have none there
 * that can take calls.
 */
export async function siblingMembershipFor(userId: string, companyId: string): Promise<{ id: string; companyName: string } | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { accountId: true } });
  if (!me?.accountId) return null;
  const target = await prisma.user.findFirst({
    where: { accountId: me.accountId, companyId, isActive: true, softphoneEnabled: true, role: { in: [...SOFTPHONE_ROLES] } },
    select: { id: true, company: { select: { name: true } } },
  });
  return target ? { id: target.id, companyName: target.company?.name ?? "" } : null;
}

/**
 * Send the VoIP push to every device of every target; dead tokens are
 * pruned. Returns how many devices were reached (best effort — "reached"
 * means Apple accepted the push, not that the phone rang).
 */
export async function pushIncomingCall(
  call: { id: string; label: string; number: string; companyName: string },
  targets: VoipTarget[]
): Promise<number> {
  const dead: string[] = [];
  let reached = 0;
  await Promise.all(
    targets.flatMap((t) => {
      // Two companies on one phone: the lock screen says which one is ringing.
      const label = t.multiCompany && call.companyName ? `${call.label} · ${call.companyName}` : call.label;
      const payload = { callId: call.id, label, number: call.number, companyName: call.companyName };
      return t.tokens.map(async (token) => {
        const r = await sendVoipPush(token, payload, VOIP_WAKE_SECS);
        if (r === "ok") reached++;
        else if (r === "dead") dead.push(token);
      });
    })
  );
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }).catch(() => {});
  console.info(`[voip] push call=${call.id} phones=${targets.reduce((n, t) => n + t.tokens.length, 0)} reached=${reached} dead=${dead.length}`);
  return reached;
}
