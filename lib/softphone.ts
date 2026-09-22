/**
 * Softphone — business-line calls in the browser (tier 2 of
 * docs/plans/business-line-voice-2026-09-18.md).
 *
 * Nothing about the call flow leaves Call Control (lib/voice.ts): a signed-in
 * browser is just one more place a leg can be dialed. Each team member gets a
 * Telnyx telephony credential (under one credential connection per company),
 * the browser registers it with @telnyx/webrtc (components/Softphone.tsx),
 * and Call Control reaches it as sip:<username>@sip.telnyx.com.
 *
 *   Inbound   every online browser rings first (APP_RING_SECS); when all of
 *             them decline or time out, the cell rings exactly as in tier 1.
 *   Outbound  the user's browser is rung instead of their cell, no whisper
 *             (the app already knows who they asked to call), then the
 *             customer is dialed and bridged.
 *
 * The credential connection deliberately has NO outbound voice profile: a
 * browser can never originate a call of its own — every call it is on was
 * dialed by us and has a Call row — and with no way to dial 911 there is no
 * E911 address obligation on the number.
 *
 * Presence: the client posts a heartbeat every ~30 s while registered
 * (User.softphoneSeenAt); "online" = a heartbeat within SOFTPHONE_PRESENCE_MS.
 * A cleanly closed tab clears it. Native shells never register (tier 3 is
 * CallKit / a foreground service; until then a phone is a cell).
 */

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { alertTelnyxFunds } from "@/lib/ops-alert";
import { hasAddon } from "@/lib/addon";
import { isRealLineNumber } from "@/lib/business-line-shared";
import {
  TelnyxError,
  createCredentialConnection,
  createCredentialToken,
  createTelephonyCredential,
  deleteCredentialConnection,
  deleteTelephonyCredential,
  ensureSipUriCalling,
  voiceConfigured,
  isInsufficientFunds,
} from "@/lib/telnyx";

/** A heartbeat older than this means the tab is gone. Heartbeats are ~30 s apart, but a long-hidden tab's timers run once a minute. */
export const SOFTPHONE_PRESENCE_MS = 100_000;
/** How long the browsers ring before the cell gets its turn. */
export const APP_RING_SECS = 15;
/** How long the user's own browser rings for a call they just placed. */
export const APP_OUTBOUND_RING_SECS = 20;
/** Fan-out cap: more browsers than this and the extras don't ring (the cell still does). */
export const MAX_APP_LEGS = 6;
/** Roles that see /app/calls and may take calls in the app (mirrors canSell). */
export const SOFTPHONE_ROLES: readonly Role[] = ["OWNER", "ADMIN", "USER", "SALES"];

/**
 * SoftphoneError.status becomes the HTTP status. Upstream failures use 424, never 502/504:
 * the site is behind Cloudflare, which replaces an origin 502/504 body with its own
 * HTML page, so the browser would never see the message.
 */
export class SoftphoneError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SoftphoneError";
    this.status = status;
  }
}

/* ───────────────────────── Pure helpers ───────────────────────── */

export function isSoftphoneOnline(seenAt: Date | null | undefined, now: Date): boolean {
  return Boolean(seenAt && now.getTime() - seenAt.getTime() <= SOFTPHONE_PRESENCE_MS);
}

export type RingTarget = { userId: string; sipUsername: string };

export type RingPlan = {
  /** Browsers to ring now (already capped). */
  app: RingTarget[];
  /** The cell that rings once the browsers give up, or right away when none are online. */
  cell: string | null;
  first: "app" | "cell" | "voicemail";
};

/** Who rings first for an inbound call. Pure — see scripts/test-voice.ts. */
export function ringPlan(online: RingTarget[], forwardTo: string | null | undefined): RingPlan {
  const app = online.slice(0, MAX_APP_LEGS);
  const cell = forwardTo || null;
  return { app, cell, first: app.length ? "app" : cell ? "cell" : "voicemail" };
}

export function canUseSoftphone(role: Role): boolean {
  return SOFTPHONE_ROLES.includes(role);
}

/* ───────────────────────── Telnyx resources ───────────────────────── */

/** Connections already checked for sip_uri_calling_preference in this process (one Telnyx GET per company per deploy). */
const sipUriChecked = new Set<string>();

/** The company's credential connection, created on first use. */
async function ensureSipConnection(company: { id: string; name: string; lineSipConnectionId: string | null }): Promise<string> {
  if (company.lineSipConnectionId) {
    // Connections made before 2026-09-21 were created without SIP URI calling; a dial at them got 403. Heal once.
    if (!sipUriChecked.has(company.lineSipConnectionId)) {
      sipUriChecked.add(company.lineSipConnectionId);
      await ensureSipUriCalling(company.lineSipConnectionId).catch((err) => {
        sipUriChecked.delete(company.lineSipConnectionId!);
        console.error("[softphone] sip_uri_calling repair failed:", err);
      });
    }
    return company.lineSipConnectionId;
  }
  const conn = await createCredentialConnection(`WorkBench softphone ${company.id} · ${company.name}`);
  // Two browsers racing here would create two connections; keep the first
  // one that landed and drop ours.
  const claimed = await prisma.company.updateMany({
    where: { id: company.id, lineSipConnectionId: null },
    data: { lineSipConnectionId: conn.id },
  });
  if (claimed.count === 0) {
    await deleteCredentialConnection(conn.id).catch(() => {});
    const fresh = await prisma.company.findUnique({ where: { id: company.id }, select: { lineSipConnectionId: true } });
    if (!fresh?.lineSipConnectionId) throw new SoftphoneError("Couldn't set up calling for this company. Try again.", 424);
    return fresh.lineSipConnectionId;
  }
  return conn.id;
}

/** The user's telephony credential under that connection, created on first use. */
async function ensureUserCredential(
  user: { id: string; name: string; sipCredentialId: string | null; sipUsername: string | null },
  connectionId: string
): Promise<{ credentialId: string; sipUsername: string }> {
  if (user.sipCredentialId && user.sipUsername) return { credentialId: user.sipCredentialId, sipUsername: user.sipUsername };
  const cred = await createTelephonyCredential(connectionId, `wb:${user.id}`);
  await prisma.user.update({ where: { id: user.id }, data: { sipCredentialId: cred.id, sipUsername: cred.sip_username } });
  return { credentialId: cred.id, sipUsername: cred.sip_username };
}

export type SoftphoneGrant = {
  /** Short-lived JWT for @telnyx/webrtc `login_token`. */
  token: string;
  sipUsername: string;
  lineNumber: string;
  companyName: string;
};

export type SoftphoneOff = {
  off: "voice" | "line" | "addon" | "role" | "disabled";
};

/**
 * What the browser needs to register, or why it shouldn't. Creates the
 * company's connection and the user's credential the first time. A
 * credential Telnyx no longer knows (deleted in Mission Control) is
 * recreated once.
 */
export async function issueSoftphoneGrant(userId: string, companyId: string): Promise<SoftphoneGrant | SoftphoneOff> {
  if (!voiceConfigured()) return { off: "voice" };
  const [company, user] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, addonActiveAt: true, lineNumber: true, lineVoiceAppAt: true, lineSipConnectionId: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, softphoneEnabled: true, sipCredentialId: true, sipUsername: true },
    }),
  ]);
  if (!company || !user) throw new SoftphoneError("Not found.", 404);
  if (!canUseSoftphone(user.role)) return { off: "role" };
  if (!hasAddon(company)) return { off: "addon" };
  if (!isRealLineNumber(company.lineNumber) || !company.lineVoiceAppAt) return { off: "line" };
  if (!user.softphoneEnabled) return { off: "disabled" };

  try {
    const connectionId = await ensureSipConnection(company);
    let cred = await ensureUserCredential(user, connectionId);
    let token: string;
    try {
      token = await createCredentialToken(cred.credentialId);
    } catch (err) {
      if (!(err instanceof TelnyxError && err.status === 404)) throw err;
      // The credential is gone at Telnyx: forget it and mint a new one.
      cred = await ensureUserCredential({ ...user, sipCredentialId: null, sipUsername: null }, connectionId);
      token = await createCredentialToken(cred.credentialId);
    }
    return { token, sipUsername: cred.sipUsername, lineNumber: company.lineNumber, companyName: company.name };
  } catch (err) {
    if (err instanceof SoftphoneError) throw err;
    if (isInsufficientFunds(err)) {
      await alertTelnyxFunds(`softphone setup for "${company.name}"`);
      throw new SoftphoneError(
        "Calling in the app is paused on our side for a moment — we've been notified. Calls still ring your phone.",
        424
      );
    }
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    throw new SoftphoneError(`Telnyx couldn't set up the softphone: ${detail}`, 424);
  }
}

/* ───────────────────────── Presence ───────────────────────── */

export async function softphoneHeartbeat(userId: string, online: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { softphoneSeenAt: online ? new Date() : null } });
}

/** Team members whose browser is registered right now — the inbound fan-out list. */
export async function onlineSoftphoneUsers(companyId: string, now = new Date()): Promise<RingTarget[]> {
  const rows = await prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      softphoneEnabled: true,
      role: { in: [...SOFTPHONE_ROLES] },
      sipUsername: { not: null },
      softphoneSeenAt: { gte: new Date(now.getTime() - SOFTPHONE_PRESENCE_MS) },
    },
    select: { id: true, sipUsername: true },
    orderBy: { softphoneSeenAt: "desc" },
    take: MAX_APP_LEGS + 1,
  });
  return rows.flatMap((r) => (r.sipUsername ? [{ userId: r.id, sipUsername: r.sipUsername }] : []));
}

/** Is THIS user's browser registered right now (outbound calls from the app need it)? */
export async function userSoftphoneOnline(userId: string, now = new Date()): Promise<{ sipUsername: string } | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { sipUsername: true, softphoneSeenAt: true, softphoneEnabled: true } });
  if (!u?.sipUsername || !u.softphoneEnabled || !isSoftphoneOnline(u.softphoneSeenAt, now)) return null;
  return { sipUsername: u.sipUsername };
}

/* ───────────────────────── Teardown ───────────────────────── */

/**
 * Best effort, for releaseLine: drop every credential and the connection at
 * Telnyx, forget them locally. Never throws — the number release must not
 * hang on a stale SIP resource.
 */
export async function deleteSoftphoneResources(companyId: string): Promise<void> {
  const [company, users] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { lineSipConnectionId: true } }),
    prisma.user.findMany({ where: { companyId, sipCredentialId: { not: null } }, select: { id: true, sipCredentialId: true } }),
  ]);
  for (const u of users) {
    if (u.sipCredentialId) await deleteTelephonyCredential(u.sipCredentialId).catch((e) => console.error("[softphone] credential delete failed:", e));
  }
  if (company?.lineSipConnectionId) {
    await deleteCredentialConnection(company.lineSipConnectionId).catch((e) => console.error("[softphone] connection delete failed:", e));
  }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { companyId }, data: { sipCredentialId: null, sipUsername: null, softphoneSeenAt: null } }),
    prisma.company.update({ where: { id: companyId }, data: { lineSipConnectionId: null } }),
  ]);
}
