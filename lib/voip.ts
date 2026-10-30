import { prisma } from "@/lib/db";
import { apnsConfigured, sendVoipPush } from "@/lib/apns";
import { fcmConfigured, sendVoipFcm } from "@/lib/push";
import { PHONE_DEVICES, PHONE_SIP_SELECT, SOFTPHONE_ROLES, hasPhoneCredential, phoneSipColumn, type PhoneDevice } from "@/lib/softphone";

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
 * The Android app (versionCode 6+) does the same with an FCM high-priority
 * DATA message (lib/push.ts sendVoipFcm) in place of the VoIP push: its
 * calling engine (android/.../VoipEngine.kt) is woken by
 * WbMessagingService, shows a full-screen incoming call from a foreground
 * service, and runs the same grant → register → ready dance with its own
 * credential (User.sipUsernameAndroid). Its token is the ordinary FCM
 * token, registered under platform "android-voip" so the server can tell a
 * shell with the engine from one without (which would never answer the
 * data message, and must keep ringing the cell at once).
 */

export const VOIP_PLATFORMS = { ios: "ios-voip", android: "android-voip" } as const satisfies Record<PhoneDevice, string>;
export const VOIP_PLATFORM = VOIP_PLATFORMS.ios;
const VOIP_PLATFORM_LIST = Object.values(VOIP_PLATFORMS) as string[];

export function voipPlatformDevice(platform: string): PhoneDevice | null {
  return platform === VOIP_PLATFORMS.ios ? "ios" : platform === VOIP_PLATFORMS.android ? "android" : null;
}

function voipConfigured(): boolean {
  return apnsConfigured() || fcmConfigured();
}

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
  tokens: { token: string; device: PhoneDevice }[];
  /** The login behind this phone has more than one company, so the system call screen names which one is ringing. */
  multiCompany: boolean;
};

/**
 * Every phone (iPhone or Android app) that should ring for this company's calls.
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
  if (!voipConfigured()) return [];
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
    where: { platform: { in: VOIP_PLATFORM_LIST }, userId: { in: [...new Set([...members.map((m) => m.id), ...siblings.map((s) => s.id)])] } },
    select: { endpoint: true, platform: true, user: { select: { id: true, accountId: true } } },
  });
  const byUser = new Map<string, VoipTarget>();
  for (const r of rows) {
    const local = members.some((m) => m.id === r.user.id) ? r.user.id : r.user.accountId ? memberByAccount.get(r.user.accountId) : undefined;
    if (!local) continue;
    const multiCompany = Boolean(r.user.accountId && (membershipsPerAccount.get(r.user.accountId) ?? 0) > 1);
    const device = voipPlatformDevice(r.platform);
    if (!device || (device === "ios" && !apnsConfigured()) || (device === "android" && !fcmConfigured())) continue;
    const t = byUser.get(local) ?? { userId: local, tokens: [], multiCompany };
    t.tokens.push({ token: r.endpoint, device });
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
/**
 * Every SIP credential of this device kind the phone behind `userId` may be
 * registered as: this membership's own first, then its siblings' (the other
 * companies on the login). The native engine registers as whichever company
 * the page is signed into, and a pushed call for ANOTHER company makes the
 * page switch the session before the engine has said it is awake
 * (SoftphoneNativeEngine probeCompany): the engine then asks as this
 * membership while still registered as the other one, and a leg to this
 * credential alone dies at Telnyx with 480 (2026-10-21: David slid to
 * answer on the lock screen; the caller heard ringback until they gave up).
 * One leg per credential rings the one the phone holds; the rest die
 * within a second, unanswered.
 */
export async function phoneCredentialsOfLogin(userId: string, device: PhoneDevice): Promise<string[]> {
  const col = phoneSipColumn(device);
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { ...PHONE_SIP_SELECT, accountId: true } });
  const own = me?.[col];
  if (!own) return [];
  const siblings = me?.accountId
    ? await prisma.user.findMany({
        where: { accountId: me.accountId, id: { not: userId }, isActive: true, ...hasPhoneCredential(device) },
        select: PHONE_SIP_SELECT,
      })
    : [];
  return uniqueCredentials(
    own,
    siblings.map((s) => s[col])
  );
}

/** @deprecated use phoneCredentialsOfLogin(userId, "ios") */
export const iosCredentialsOfLogin = (userId: string) => phoneCredentialsOfLogin(userId, "ios");

/** Own credential first, then the siblings', no repeats or blanks. */
export function uniqueCredentials(own: string, siblings: Array<string | null | undefined>): string[] {
  const out = [own];
  for (const s of siblings) if (s && !out.includes(s)) out.push(s);
  return out;
}

export async function voipRegisteredSoftphone(userId: string, device?: PhoneDevice): Promise<{ sipUsername: string; device: PhoneDevice } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { sipUsernameIos: true, sipUsernameAndroid: true, softphoneEnabled: true, accountId: true },
  });
  if (!u?.softphoneEnabled) return null;
  const devices = device ? [device] : PHONE_DEVICES;
  for (const d of devices) {
    const sipUsername = u[phoneSipColumn(d)];
    if (!sipUsername) continue;
    const token = await prisma.pushSubscription.findFirst({
      where: { platform: VOIP_PLATFORMS[d], OR: [{ userId }, ...(u.accountId ? [{ user: { accountId: u.accountId } }] : [])] },
      select: { id: true },
    });
    if (token) return { sipUsername, device: d };
  }
  return null;
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
 * Send the wake push to every device of every target — APNs VoIP for an
 * iPhone, an FCM data message for an Android phone; dead tokens are pruned.
 * Returns how many devices were reached (best effort — "reached" means the
 * push service accepted it, not that the phone rang).
 */
export async function pushIncomingCall(
  call: { id: string; label: string; number: string; companyName: string },
  targets: VoipTarget[]
): Promise<number> {
  const dead: string[] = [];
  // One word per phone in the log line, so a call that "went straight to
  // the cell" can be read: which device was pushed and what APNs/FCM said
  // (2026-10-30: one of two iPhones reached, the other a sandbox token the
  // production key can't push to — and the reached one never woke).
  const outcomes: string[] = [];
  let reached = 0;
  await Promise.all(
    targets.flatMap((t) => {
      // Two companies on one phone: the lock screen says which one is ringing.
      const label = t.multiCompany && call.companyName ? `${call.label} · ${call.companyName}` : call.label;
      const payload = { callId: call.id, label, number: call.number, companyName: call.companyName };
      return t.tokens.map(async ({ token, device }) => {
        const r =
          device === "android"
            ? await sendVoipFcm(token, { ...payload, sentAt: String(Date.now()) }, VOIP_WAKE_SECS)
            : await sendVoipPush(token, payload, VOIP_WAKE_SECS);
        if (r === "ok") reached++;
        else if (r === "dead") dead.push(token);
        outcomes.push(`${device}:${token.slice(0, 6)}=${r}`);
      });
    })
  );
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }).catch(() => {});
  console.info(`[voip] push call=${call.id} phones=${targets.reduce((n, t) => n + t.tokens.length, 0)} reached=${reached} dead=${dead.length} ${outcomes.join(" ")}`);
  return reached;
}
