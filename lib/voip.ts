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

/** How long the caller waits for a pushed phone to wake and ring before the cell gets its turn. */
export const VOIP_WAKE_SECS = 25;

export type VoipTarget = { userId: string; tokens: string[] };

/** Team members with a VoIP-registered iPhone who may take calls in the app. */
export async function voipTargetsFor(companyId: string): Promise<VoipTarget[]> {
  if (!apnsConfigured()) return [];
  const rows = await prisma.pushSubscription.findMany({
    where: {
      platform: VOIP_PLATFORM,
      user: { companyId, isActive: true, softphoneEnabled: true, role: { in: [...SOFTPHONE_ROLES] } },
    },
    select: { userId: true, endpoint: true },
  });
  const byUser = new Map<string, string[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.endpoint]);
  return [...byUser].map(([userId, tokens]) => ({ userId, tokens }));
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
  const payload = { callId: call.id, label: call.label, number: call.number, companyName: call.companyName };
  const dead: string[] = [];
  let reached = 0;
  await Promise.all(
    targets.flatMap((t) =>
      t.tokens.map(async (token) => {
        const r = await sendVoipPush(token, payload, VOIP_WAKE_SECS);
        if (r === "ok") reached++;
        else if (r === "dead") dead.push(token);
      })
    )
  );
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }).catch(() => {});
  return reached;
}
