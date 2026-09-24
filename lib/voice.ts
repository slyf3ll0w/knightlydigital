/**
 * Voice on the business line — Telnyx Call Control (lib/telnyx.ts).
 *
 * Number-level call forwarding (the first cut of the business line) passes
 * the customer's caller ID straight through, so the owner's cell rang like
 * any personal call. With the number on the WorkBench Call Control app WE
 * answer instead, and every call becomes a small script:
 *
 * Inbound   customer → line
 *   call.initiated   answer the customer leg (they hear our ringback loop)
 *   call.answered    dial the owner's cell FROM the business number
 *   call.answered    (cell) whisper: "Streamflaire call from Maria Lopez.
 *                    Press 1 to accept" — the cell's own voicemail can never
 *                    swallow a customer, because it can't press 1
 *   gather.ended     1 → bridge the legs; anything else → voicemail
 *   hangup (cell)    before 1 → voicemail
 *   speak.ended      greeting done → record (beep, ≤3 min, stops on silence)
 *   recording.saved  keep the recording id, push the team, hang up
 *
 * Outbound  owner → customer, from the app (startOutboundCall)
 *   dial the owner's cell from the line → "Press 1 to call Maria Lopez" →
 *   dial the customer from the line (owner hears ringback) → bridge.
 *   The customer only ever sees the business number.
 *
 * Softphone (lib/softphone.ts): browsers signed in on a computer are SIP
 * legs dialed the same way. Inbound they ring before the cell — one CallLeg
 * row per browser, and the winner's id is copied into agentCallId so the
 * rest of the machine never knows how many rang. Outbound the user's own
 * browser replaces the cell and the whisper is skipped.
 *
 * Every leg carries a base64 client_state {callId, leg, stage}, but the Call
 * row is looked up by call_control_id (telnyxCallId = customer leg,
 * agentCallId = cell leg) — the state is a hint, the row is the truth.
 * Telnyx retries webhooks and can deliver them out of order, so every
 * transition that spends money (a dial) or must happen once (voicemail) is
 * guarded by a conditional updateMany on the row.
 *
 * Env: TELNYX_VOICE_APP_ID (scripts/telnyx-voice-setup.ts). Unset = the
 * number keeps plain forwarding and none of this runs.
 */

import type { Call, CallStatus, Contact, ContactStatus, PipelineTrigger } from "@prisma/client";
import { prisma } from "@/lib/db";
import { autoAdvance } from "@/lib/pipeline";
import { fireAutomations } from "@/lib/automations-server";
import { alertTelnyxFunds } from "@/lib/ops-alert";
import { hasAddon } from "@/lib/addon";
import { defaultVoicemailGreeting, isRealLineNumber } from "@/lib/business-line-shared";
import { fmtPhone } from "@/lib/format";
import { phoneDigits } from "@/lib/phone";
import { notifyUsers } from "@/lib/push";
import { toE164 } from "@/lib/sms";
import { APP_OUTBOUND_RING_SECS, APP_RING_SECS, VOIP_APP_RING_SECS, canUseSoftphone, onlineSoftphoneUsers, ringPlan, userSoftphoneOnline, type RingTarget } from "@/lib/softphone";
import { appendTranscript, summarizeCallNotes, transcriptLine, type AtlasNotesSnapshot } from "@/lib/call-notes";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { aiEnabled } from "@/lib/ai";
import { VOIP_WAKE_SECS, pushIncomingCall, voipRegisteredSoftphone, voipTargetsFor } from "@/lib/voip";
import {
  TTS,
  TelnyxError,
  callAction,
  dialCall,
  getRecording,
  listRecordingsForLeg,
  setCallForwarding,
  setNumberConnection,
  sipUri,
  voiceAppId,
  voiceConfigured,
  isInsufficientFunds,
} from "@/lib/telnyx";

/**
 * VoiceError.status becomes the HTTP status. Upstream failures use 424, never 502/504:
 * the site is behind Cloudflare, which replaces an origin 502/504 body with its own
 * HTML page, so the browser would never see the message.
 */
export class VoiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
  }
}

/** What a tenant sees when Telnyx refuses a call because OUR account is out of funds. */
export const VOICE_PAUSED_MESSAGE =
  "Calling from the line is paused on our side for a moment — we've been notified. Use your phone for this one.";

export function voiceEnabled(): boolean {
  return voiceConfigured();
}

const baseUrl = () => (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
const ringbackUrl = () => `${baseUrl()}/ringback.wav`;
/** The hold loop (public/hold-music.mp3, ~3:20): what the other party hears while the browser leg is held — never while the line is still ringing, which sounds like a pickup. */
const holdMusicUrl = () => `${baseUrl()}/hold-music.mp3`;

/** How long the owner's cell rings before it counts as no answer. Short: their carrier voicemail would answer at ~25 s anyway. */
export const AGENT_RING_SECS = 25;
/**
 * How long a customer's phone rings on an outbound call. Carrier voicemail
 * picks up after 25–30 s of ringing (some carriers 45 s), and the old 30 s
 * here expired at that very moment: the leg was cut as the greeting began,
 * the owner heard "No answer" and could never leave a message. Telnyx
 * allows up to 600; a minute covers every carrier's voicemail delay.
 */
export const CUSTOMER_RING_SECS = 60;
export const VOICEMAIL_MAX_SECS = 180;
/** A voicemail shorter than this is a hang-up, not a message. */
export const VOICEMAIL_MIN_SECS = 2;
/** RINGING rows older than this never got their hangup webhook — close them. */
export const STALE_RINGING_MS = 5 * 60_000;
/**
 * IN_PROGRESS rows older than this are a lost hangup webhook. Telnyx itself
 * ends any leg at 4 h (time_limit_secs), so nothing real is still up past
 * that. This used to share the 5-minute ringing limit, which made the hourly
 * sweep hang up every live call that had passed five minutes — a real
 * conversation dropped at the top of the hour with a "they hung up" chime.
 */
export const STALE_IN_PROGRESS_MS = 4 * 3_600_000 + 5 * 60_000;
/** VOICEMAIL rows with no recording this long after the hangup left nothing. */
export const STALE_VOICEMAIL_MS = 10 * 60_000;

/* ───────────────────────── Pure helpers ───────────────────────── */

/** customer = the far party; agent = the cell, or the one browser that won / placed the call; app = a browser rung for an inbound call. */
export type Leg = "customer" | "agent" | "app";
export type Stage = "ring" | "whisper" | "bridged" | "vm_greeting" | "vm_record" | "out_whisper" | "out_no_answer";
/** `woke`: this app leg belongs to an iPhone that a VoIP push woke for the call (lib/voip.ts). */
export type ClientState = { callId: string; leg: Leg; stage?: Stage; userId?: string; woke?: boolean };

export function encodeState(s: ClientState): string {
  return Buffer.from(JSON.stringify(s)).toString("base64");
}

export function decodeState(raw: string | null | undefined): ClientState | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ClientState>;
    if (typeof j.callId !== "string" || (j.leg !== "customer" && j.leg !== "agent" && j.leg !== "app")) return null;
    return { callId: j.callId, leg: j.leg, stage: j.stage, ...(typeof j.userId === "string" ? { userId: j.userId } : {}), ...(j.woke === true ? { woke: true } : {}) };
  } catch {
    return null;
  }
}

/** "2 1 4, 5 5 5, 0 1 0 0" — digits TTS reads one at a time instead of "two billion". */
export function spokenNumber(e164: string): string {
  const d = e164.replace(/\D/g, "");
  const local = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (local.length === 10) {
    return [local.slice(0, 3), local.slice(3, 6), local.slice(6)].map((g) => g.split("").join(" ")).join(", ");
  }
  return local ? local.split("").join(" ") : "an unknown number";
}

/** How the whisper names the far party: the contact's name when we know them, otherwise the number read out. */
export function partyLabel(contact: Pick<Contact, "firstName" | "lastName"> | null | undefined, number: string): string {
  const name = contact ? `${contact.firstName} ${contact.lastName}`.trim() : "";
  return name || spokenNumber(number);
}

export function whisperText(businessName: string, caller: string): string {
  return `${businessName} call from ${caller}. Press 1 to accept, or hang up to send it to voicemail.`;
}

export function outboundWhisperText(businessName: string, callee: string): string {
  return `Press 1 to call ${callee} from your ${businessName} line.`;
}

/**
 * Telnyx `from_display_name` (what the softphone shows as the caller name)
 * allows ≤128 chars of letters, digits, spaces and -_~!.+ — nothing else, and
 * a 422 rejects the whole dial (that is how the first live test lost its
 * browser legs: "(469) 833-5853" has parentheses). A number-looking label
 * becomes 469-833-5853; anything else is stripped to the allowed set.
 */
export function sipDisplayName(label: string | null | undefined): string | undefined {
  const raw = (label ?? "").trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  const numberLike = /^[\d\s()+.\-]+$/.test(raw) && digits.length >= 10;
  let base = raw;
  if (numberLike) {
    const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    base = local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local;
  }
  const clean = base
    .replace(/[^A-Za-z0-9 \-_~!.+]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 128);
  return clean || undefined;
}

export function greetingFor(businessName: string, custom: string | null | undefined): string {
  const c = (custom ?? "").trim();
  return c || defaultVoicemailGreeting(businessName);
}

/** Validate a custom greeting from the settings form; null = back to the default. */
export function sanitizeGreeting(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!s) return null;
  if (s.length > 600) throw new VoiceError("Keep the greeting under 600 characters.");
  return s;
}

const TERMINAL: ReadonlySet<CallStatus> = new Set(["COMPLETED", "MISSED", "VOICEMAIL", "NO_ANSWER", "FAILED"]);
export const isTerminalStatus = (s: CallStatus): boolean => TERMINAL.has(s);

/** Telnyx hangup causes that mean "nobody picked up" rather than "something broke". */
const NO_ANSWER_CAUSES = new Set(["timeout", "no_answer", "user_busy", "call_rejected", "originator_cancel"]);

/**
 * Where a call ends up when the CUSTOMER leg hangs up. Pure, so the whole
 * table sits in scripts/test-voice.ts:
 *   bridged             → COMPLETED
 *   inbound, ringing    → MISSED (they left before anyone pressed 1)
 *   inbound, voicemail  → VOICEMAIL (recording.saved fills in the rest; the
 *                          stale sweep turns an empty one into MISSED)
 *   outbound, ringing   → NO_ANSWER for the "nobody there" causes, else FAILED
 *   already terminal    → unchanged
 */
export function statusAfterCustomerHangup(call: Pick<Call, "status" | "direction">, cause: string | null | undefined): CallStatus {
  if (isTerminalStatus(call.status)) return call.status;
  if (call.status === "IN_PROGRESS") return "COMPLETED";
  if (call.status === "VOICEMAIL") return "VOICEMAIL";
  if (call.direction === "INBOUND") return "MISSED";
  return !cause || NO_ANSWER_CAUSES.has(cause) ? "NO_ANSWER" : "FAILED";
}

/**
 * Which Leads-board automation a call's status stands for, if any. Pure —
 * the table sits in scripts/test-voice.ts:
 *   bridged / completed  → CONTACT_MADE (you actually spoke, either direction)
 *   outbound, no answer  → CALL_NO_ANSWER (they didn't pick up; busy/rejected
 *                          count too — see NO_ANSWER_CAUSES)
 *   anything else        → null (inbound missed = they tried to reach YOU;
 *                          voicemail, failed dials and cancels say nothing
 *                          about the lead)
 * Fired from bridgeLegs (so the card moves while you're still on the line),
 * from the customer-leg hangup (which also catches a lead saved mid-call —
 * autoAdvance is forward-only, so the repeat is harmless), and from the two
 * places our side gives up on a ringing customer (agent-leg hangup, cancel).
 */
export function pipelineTriggerForCall(call: Pick<Call, "status" | "direction">): PipelineTrigger | null {
  if (call.status === "IN_PROGRESS" || call.status === "COMPLETED") return "CONTACT_MADE";
  if (call.direction === "OUTBOUND" && call.status === "NO_ANSWER") return "CALL_NO_ANSWER";
  return null;
}

/** Move the caller's Leads-board card for what just happened on the call. Never throws — the call flow comes first. */
async function advanceLeadForCall(call: Pick<Call, "id" | "companyId" | "contactId">, status: CallStatus, direction: Call["direction"]): Promise<void> {
  if (!call.contactId) return;
  const trigger = pipelineTriggerForCall({ status, direction });
  if (!trigger) return;
  // Same table drives the automations engine (the run log dedupes repeats per contact)
  fireAutomations(call.companyId, trigger === "CONTACT_MADE" ? "lead.contact_made" : "lead.no_answer", call.contactId);
  try {
    await autoAdvance(prisma, call.companyId, call.contactId, trigger);
  } catch (err) {
    console.error(`[voice] lead auto-advance failed for call ${call.id}:`, err);
  }
}

/** The call row reached a terminal status — tell the automations engine which one. Never throws. */
function fireCallStatus(call: Pick<Call, "id" | "companyId" | "direction" | "status">, status: CallStatus): void {
  if (status === call.status) return;
  if (status === "COMPLETED") fireAutomations(call.companyId, call.direction === "INBOUND" ? "call.inbound" : "call.outbound_completed", call.id);
  else if (status === "MISSED") fireAutomations(call.companyId, "call.missed", call.id);
}

/**
 * Where an OUTBOUND call lands when OUR side ends it before the customer
 * answers (the cell hangs up mid-ring, the softphone's cancel). Once the
 * customer leg has actually been dialed that is "they didn't pick up" —
 * NO_ANSWER, the same verdict the customer-leg webhook gives an
 * originator_cancel — not a failure. Before the dial (whisper declined,
 * nothing rang) nothing can be said about the lead: FAILED.
 */
export function unansweredOutboundStatus(call: Pick<Call, "telnyxCallId">): CallStatus {
  return call.telnyxCallId && !call.telnyxCallId.startsWith("pending:") ? "NO_ANSWER" : "FAILED";
}

export type StaleAction = "close" | "empty_voicemail" | null;

/** What the sweep should do with a row that stopped getting webhooks. */
export function staleCallPlan(
  call: Pick<Call, "status" | "createdAt" | "endedAt" | "voicemailRecordingId">,
  now: Date
): StaleAction {
  if (call.status === "RINGING") {
    return now.getTime() - call.createdAt.getTime() > STALE_RINGING_MS ? "close" : null;
  }
  if (call.status === "IN_PROGRESS") {
    return now.getTime() - call.createdAt.getTime() > STALE_IN_PROGRESS_MS ? "close" : null;
  }
  if (call.status === "VOICEMAIL" && !call.voicemailRecordingId) {
    const since = call.endedAt ?? call.createdAt;
    return now.getTime() - since.getTime() > STALE_VOICEMAIL_MS ? "empty_voicemail" : null;
  }
  return null;
}

export function talkSeconds(answeredAt: Date | null, endedAt: Date): number | null {
  if (!answeredAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000));
}

/* ───────────────────────── Routing setup ───────────────────────── */

/**
 * Put the number on the Call Control app and switch the number-level
 * forwarding off (it would otherwise win and we'd never see the call).
 * Telnyx-only; the caller stamps Company.lineVoiceAppAt. False when voice
 * isn't configured on this server.
 */
export async function routeNumberToVoiceApp(numberId: string, fallbackForwardTo?: string | null): Promise<boolean> {
  if (!voiceEnabled()) return false;
  // Order matters: Telnyx refuses to put a number on a Call Control app while
  // number-level forwarding is enabled ("You cannot use automatic call
  // forwarding with a Call Control … number"), so forwarding goes off first.
  await setCallForwarding(numberId, null);
  try {
    await setNumberConnection(numberId, voiceAppId());
  } catch (err) {
    // Never leave the number dead: put the old forwarding back before failing.
    if (fallbackForwardTo) {
      await setCallForwarding(numberId, fallbackForwardTo).catch((e) => console.error("[voice] forwarding restore failed:", e));
    }
    throw err;
  }
  return true;
}

/** Idempotent: migrate a company's number onto Call Control if it isn't there yet. */
export async function ensureVoiceRouting(companyId: string): Promise<boolean> {
  if (!voiceEnabled()) return false;
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, lineNumber: true, lineNumberId: true, lineForwardTo: true, lineVoiceAppAt: true },
  });
  if (!c || !isRealLineNumber(c.lineNumber) || !c.lineNumberId) return false;
  if (c.lineVoiceAppAt) return true;
  try {
    await routeNumberToVoiceApp(c.lineNumberId, c.lineForwardTo);
  } catch (err) {
    if (isInsufficientFunds(err)) {
      await alertTelnyxFunds(`voice routing for "${c.name}"`);
      throw new VoiceError(VOICE_PAUSED_MESSAGE, 424);
    }
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    throw new VoiceError(`Telnyx couldn't move the number onto the voice app: ${detail}`, 424);
  }
  await prisma.company.update({ where: { id: c.id }, data: { lineVoiceAppAt: new Date() } });
  console.warn(`[voice] ${c.lineNumber} now on the Call Control app for "${c.name}" (${c.id})`);
  return true;
}

/* ───────────────────────── Webhook events ───────────────────────── */

export type VoiceEventPayload = {
  call_control_id?: string;
  call_leg_id?: string;
  call_session_id?: string;
  client_state?: string;
  direction?: "incoming" | "outgoing";
  from?: string;
  to?: string;
  hangup_cause?: string;
  hangup_source?: string;
  /** call.gather.ended */
  digits?: string;
  status?: string;
  /** call.recording.saved */
  recording_id?: string;
  recording_started_at?: string;
  recording_ended_at?: string;
  /** call.transcription (Atlas notes, lib/call-notes.ts) */
  transcription_data?: { transcript?: string; is_final?: boolean; confidence?: number; transcription_track?: string };
};

export type VoiceEvent = { event_type: string; id?: string; payload: VoiceEventPayload };

const companySelect = {
  id: true,
  name: true,
  lineNumber: true,
  lineForwardTo: true,
  lineVoicemailGreeting: true,
} as const;

type CallRow = Call & {
  company: { id: string; name: string; lineNumber: string | null; lineForwardTo: string | null; lineVoicemailGreeting: string | null };
  contact: Pick<Contact, "firstName" | "lastName"> | null;
};

type AppLeg = { id: string; telnyxCallId: string; userId: string | null };
type LegHit = { call: CallRow; leg: Leg; appLeg: AppLeg | null };

const callInclude = { company: { select: companySelect }, contact: { select: { firstName: true, lastName: true } } } as const;

/**
 * The row behind a webhook's call_control_id: the customer leg, the agent leg
 * (the cell, or the browser that won / placed the call), or one of the
 * browser legs rung for an inbound call (CallLeg). A browser leg whose row
 * hasn't landed yet — Telnyx can deliver its first event before our insert
 * commits — is adopted from the client_state stamped on the dial, so a fast
 * decline is never lost (it would leave the caller on ringback until the
 * stale sweep).
 */
async function findCallByLeg(ccid: string | undefined, clientState?: string | null): Promise<LegHit | null> {
  if (!ccid) return null;
  const call = await prisma.call.findFirst({
    where: { OR: [{ telnyxCallId: ccid }, { agentCallId: ccid }] },
    include: callInclude,
  });
  if (call) return { call, leg: call.telnyxCallId === ccid ? "customer" : "agent", appLeg: null };
  const appLeg = await prisma.callLeg.findUnique({
    where: { telnyxCallId: ccid },
    select: { id: true, telnyxCallId: true, userId: true, call: { include: callInclude } },
  });
  if (appLeg) return { call: appLeg.call, leg: "app", appLeg: { id: appLeg.id, telnyxCallId: appLeg.telnyxCallId, userId: appLeg.userId } };
  const state = decodeState(clientState);
  if (!state || state.leg !== "app") return null;
  const parent = await prisma.call.findUnique({ where: { id: state.callId }, include: callInclude });
  if (!parent) return null;
  const adopted = await prisma.callLeg.upsert({
    where: { telnyxCallId: ccid },
    create: { callId: parent.id, userId: state.userId ?? null, telnyxCallId: ccid },
    update: {},
    select: { id: true, telnyxCallId: true, userId: true },
  });
  return { call: parent, leg: "app", appLeg: adopted };
}

/** Entry point for /api/public/webhooks/telnyx/voice. Never throws; a failed step is logged and the call falls through to Telnyx's own timeout. */
export async function handleVoiceEvent(ev: VoiceEvent): Promise<void> {
  const p = ev.payload ?? {};
  try {
    switch (ev.event_type) {
      case "call.initiated":
        if (p.direction === "incoming") await onInboundInitiated(p);
        return;
      case "call.answered":
        return onAnswered(p);
      case "call.gather.ended":
        return onGatherEnded(p);
      case "call.speak.ended":
        return onSpeakEnded(p);
      case "call.hangup":
        return onHangup(p);
      case "call.recording.saved":
        return onRecordingSaved(p);
      case "call.transcription":
        return onTranscription(p);
      default:
        return;
    }
  } catch (err) {
    console.error(`[voice] ${ev.event_type} failed:`, err);
  }
}

async function onInboundInitiated(p: VoiceEventPayload): Promise<void> {
  const ccid = p.call_control_id;
  const to = p.to ?? "";
  if (!ccid || !to) return;
  const company = await prisma.company.findUnique({ where: { lineNumber: to }, select: companySelect });
  if (!company) {
    console.warn(`[voice] call to ${to} — no company owns that number; hanging up`);
    await callAction(ccid, "hangup");
    return;
  }
  if (await prisma.call.findUnique({ where: { telnyxCallId: ccid }, select: { id: true } })) return; // retry

  const from = p.from ?? "";
  const digits = phoneDigits(from);
  const contact = digits
    ? await prisma.contact.findFirst({
        where: { companyId: company.id, phoneDigits: digits },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
    : null;
  const call = await prisma.call.create({
    data: {
      companyId: company.id,
      contactId: contact?.id ?? null,
      direction: "INBOUND",
      status: "RINGING",
      customerNumber: from || "unknown",
      customerDigits: digits,
      agentNumber: company.lineForwardTo,
      telnyxCallId: ccid,
      customerLegId: p.call_leg_id ?? null,
    },
    select: { id: true },
  });
  await callAction(ccid, "answer", { client_state: encodeState({ callId: call.id, leg: "customer", stage: "ring" }) });
}

async function onAnswered(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  if (!hit) return;
  const { call, leg, appLeg } = hit;
  if (call.status !== "RINGING") {
    // A browser that picked up after someone else already won: drop it.
    if (leg === "app" && appLeg) await callAction(appLeg.telnyxCallId, "hangup");
    return;
  }

  if (call.direction === "INBOUND" && leg === "customer") {
    if (!call.company.lineNumber) return toVoicemail(call);
    const [online, phones] = await Promise.all([onlineSoftphoneUsers(call.companyId), voipTargetsFor(call.companyId)]);
    const plan = ringPlan(online, call.company.lineForwardTo);
    if (plan.first === "voicemail" && phones.length === 0) return toVoicemail(call);
    if (plan.first === "app" || phones.length > 0) {
      // Guard the fan-out: a retried webhook must not ring every browser twice.
      const claimed = await prisma.call.updateMany({ where: { id: call.id, appRingAt: null }, data: { appRingAt: new Date(), via: "app" } });
      if (claimed.count === 0) return;
      await callAction(call.telnyxCallId!, "playback_start", { audio_url: ringbackUrl(), loop: "infinity" });
      // Browsers ring now, as SIP legs. iPhones get a VoIP push instead
      // (lib/voip.ts): iOS shows the call at once, and each phone's SIP leg
      // is dialed only when the app says it is awake (wakeSoftphoneLeg).
      const ringing = await ringSoftphones(call, plan.app);
      const woken = phones.length
        ? await pushIncomingCall(
            { id: call.id, label: displayParty(call), number: call.customerNumber, companyName: call.company.name },
            phones
          )
        : 0;
      // A pushed phone gets its whole wake window even if browsers rang too
      // (their legs time out sooner and must not hand the call on early —
      // see the app-leg hangup): this timer is what moves the call to the
      // cell if no phone has woken by then.
      if (woken > 0) scheduleCellFallback(call.id, (VOIP_WAKE_SECS + 3) * 1000);
      if (ringing > 0 || woken > 0) return;
      // Not one browser could be dialed: the cell's turn, ringback already looping.
      return dialCell(call, { ringback: false });
    }
    return dialCell(call, { ringback: true });
  }

  if (call.direction === "INBOUND" && leg === "app" && appLeg) {
    // The first browser to answer wins; the claim is the lock.
    const claimed = await prisma.call.updateMany({
      where: { id: call.id, status: "RINGING", agentCallId: null },
      data: { agentCallId: appLeg.telnyxCallId, answeredByUserId: appLeg.userId, agentNumber: null, via: "app" },
    });
    if (claimed.count === 0) {
      await callAction(appLeg.telnyxCallId, "hangup");
      return;
    }
    await hangupAppLegs(call.id, appLeg.telnyxCallId);
    await bridgeLegs({ ...call, agentCallId: appLeg.telnyxCallId });
    return;
  }

  if (call.direction === "INBOUND" && leg === "agent") {
    await callAction(call.agentCallId!, "gather_using_speak", {
      payload: whisperText(call.company.name, partyLabel(call.contact, call.customerNumber)),
      ...TTS,
      valid_digits: "1",
      minimum_digits: 1,
      maximum_digits: 1,
      timeout_millis: 7000,
      maximum_tries: 2,
      client_state: encodeState({ callId: call.id, leg: "agent", stage: "whisper" }),
    });
    return;
  }

  if (call.direction === "OUTBOUND" && leg === "agent") {
    // A browser already knows who it asked to call: no whisper, straight to the customer.
    if (call.via === "app") return dialCustomer(call);
    await callAction(call.agentCallId!, "gather_using_speak", {
      payload: outboundWhisperText(call.company.name, partyLabel(call.contact, call.customerNumber)),
      ...TTS,
      valid_digits: "1",
      minimum_digits: 1,
      maximum_digits: 1,
      timeout_millis: 7000,
      maximum_tries: 2,
      client_state: encodeState({ callId: call.id, leg: "agent", stage: "out_whisper" }),
    });
    return;
  }

  if (call.direction === "OUTBOUND" && leg === "customer") {
    await bridgeLegs(call);
  }
}

/** Ring the cell from the business number (tier 1). The agentCallId claim is the lock against a retried webhook. */
async function dialCell(call: CallRow, opts: { ringback: boolean }): Promise<void> {
  const forwardTo = call.company.lineForwardTo;
  if (!forwardTo || !call.company.lineNumber) return toVoicemail(call);
  const claimed = await prisma.call.updateMany({
    where: { id: call.id, agentCallId: null },
    data: { agentCallId: `pending:${call.id}`, via: "cell" },
  });
  if (claimed.count === 0) return;
  if (opts.ringback) await callAction(call.telnyxCallId!, "playback_start", { audio_url: ringbackUrl(), loop: "infinity" });
  try {
    const leg2 = await dialCall({
      to: forwardTo,
      from: call.company.lineNumber,
      clientState: encodeState({ callId: call.id, leg: "agent", stage: "ring" }),
      timeoutSecs: AGENT_RING_SECS,
      linkTo: call.telnyxCallId!,
      commandId: `${call.id}:agent`,
    });
    await prisma.call.update({ where: { id: call.id }, data: { agentCallId: leg2.call_control_id, agentNumber: forwardTo } });
  } catch (err) {
    console.error("[voice] dialing the cell failed:", err);
    await prisma.call.update({ where: { id: call.id }, data: { agentCallId: null } });
    await toVoicemail(call);
  }
}

/** Dial every online browser as a SIP leg (one CallLeg row each). Returns how many are ringing. `woke` = these are pushed iPhones (longer ring, voicemail instead of the cell when it runs out). */
async function ringSoftphones(call: CallRow, targets: RingTarget[], woke = false): Promise<number> {
  let ringing = 0;
  const label = displayParty(call);
  for (const t of targets) {
    const device = t.device ?? (woke ? "ios" : "browser");
    try {
      const leg = await dialCall({
        to: sipUri(t.sipUsername),
        from: call.company.lineNumber!,
        fromDisplayName: sipDisplayName(label),
        customHeaders: [{ name: "X-WB-Call-Id", value: call.id }],
        clientState: encodeState({ callId: call.id, leg: "app", stage: "ring", userId: t.userId, ...(woke ? { woke: true } : {}) }),
        timeoutSecs: woke ? VOIP_APP_RING_SECS : APP_RING_SECS,
        linkTo: call.telnyxCallId!,
        // command_id is Telnyx's idempotency key. One per call, user AND
        // device: the phone's wake leg used to share the browser leg's key,
        // so Telnyx answered the second dial with the first leg and never
        // rang the phone at all (found in the Prog. Voice Call Flow Tool —
        // the phone's leg simply did not exist).
        // A woken phone may ask again after re-registering (its first leg
        // died at 480), so its key is per attempt; the browser fan-out keeps
        // one key per call (the appRingAt claim already stops a retried
        // webhook ringing twice).
        commandId: woke ? `${call.id}:app:${t.userId}:${device}:${Date.now()}` : `${call.id}:app:${t.userId}:${device}`,
      });
      // upsert: the leg's first webhook may have adopted the row already (findCallByLeg).
      await prisma.callLeg.upsert({
        where: { telnyxCallId: leg.call_control_id },
        create: { callId: call.id, userId: t.userId, telnyxCallId: leg.call_control_id, device },
        update: { userId: t.userId, device },
      });
      ringing++;
    } catch (err) {
      console.error(`[voice] dialing softphone ${t.sipUsername} failed:`, err);
    }
  }
  return ringing;
}

/**
 * After a VoIP push with no browser leg alongside it, nothing else moves the
 * call on: a phone that never wakes produces no hangup webhook. This timer
 * does what a timed-out browser leg would have — hands the call to the cell
 * if it is still unanswered. Idempotent with everything else (dialCell's
 * agentCallId claim; an open leg means a phone is ringing and its own
 * timeout will take over).
 */
function scheduleCellFallback(callId: string, delayMs: number): void {
  setTimeout(() => {
    void (async () => {
      const call = await prisma.call.findUnique({ where: { id: callId }, include: callInclude });
      if (!call || call.status !== "RINGING" || call.direction !== "INBOUND" || call.agentCallId) return;
      const open = await prisma.callLeg.count({ where: { callId, endedAt: null } });
      if (open > 0) return;
      await dialCell(call, { ringback: false });
    })().catch((err) => console.error("[voice] cell fallback failed:", err));
  }, delayMs);
}

export type WakeOutcome = "ringing" | "already" | "late" | "ineligible";

/**
 * The iPhone app is awake for a call it was pushed for
 * (POST /api/app/line/softphone/ready): dial its SIP leg now, if the call is
 * still ringing and nobody has it. "late" = it went elsewhere (answered,
 * cell already ringing, caller gone) and the app should drop the system
 * call screen.
 */
export async function wakeSoftphoneLeg(userId: string, companyId: string, callId: string): Promise<WakeOutcome> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call || call.status !== "RINGING" || call.direction !== "INBOUND" || call.agentCallId || !call.appRingAt) {
    console.info(`[voice] wake call=${callId}: late (${!call ? "no row" : `status=${call.status} agent=${call.agentCallId ?? "-"} appRingAt=${call.appRingAt?.toISOString() ?? "-"}`})`);
    return "late";
  }
  const sinceRing = Date.now() - call.appRingAt.getTime();
  if (sinceRing > (VOIP_WAKE_SECS + 5) * 1000) {
    console.info(`[voice] wake call=${callId}: late (${Math.round(sinceRing / 1000)} s after the push)`);
    return "late";
  }
  // The phone's OWN credential: a leg already ringing this user's browser is
  // not this phone's leg (that mistake read as "already" and left a phone
  // that had answered on the lock screen with nothing to answer).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sipUsernameIos: true, softphoneEnabled: true, role: true, isActive: true },
  });
  if (!user?.sipUsernameIos || !user.softphoneEnabled || !user.isActive || !canUseSoftphone(user.role)) {
    console.info(`[voice] wake call=${callId}: ineligible (sip=${user?.sipUsernameIos ? "yes" : "no"} on=${user?.softphoneEnabled} active=${user?.isActive} role=${user?.role})`);
    return "ineligible";
  }
  const open = await prisma.callLeg.count({ where: { callId, userId, device: "ios", endedAt: null } });
  if (open > 0) return "already";
  const rang = await ringSoftphones(call, [{ userId, sipUsername: user.sipUsernameIos, device: "ios" }], true);
  console.info(`[voice] wake call=${callId}: ${rang > 0 ? "ringing" : "late"} — SIP leg to ${user.sipUsernameIos} ${rang > 0 ? "dialed" : "failed"} ${Math.round(sinceRing / 1000)} s after the push`);
  return rang > 0 ? "ringing" : "late";
}

/** Hang up every browser leg still ringing on a call, except the one that won. Their hangup webhooks close the rows. */
async function hangupAppLegs(callId: string, keep: string | null): Promise<void> {
  const legs = await prisma.callLeg.findMany({
    where: { callId, endedAt: null, ...(keep ? { telnyxCallId: { not: keep } } : {}) },
    select: { telnyxCallId: true },
  });
  for (const l of legs) {
    await callAction(l.telnyxCallId, "hangup").catch((e) => console.error("[voice] app leg hangup failed:", e));
  }
}

/** Join the agent leg to the customer leg; the row flips to IN_PROGRESS only if Telnyx accepted the bridge. */
async function bridgeLegs(call: CallRow): Promise<void> {
  if (!call.agentCallId || !call.telnyxCallId) return;
  await callAction(call.direction === "INBOUND" ? call.telnyxCallId : call.agentCallId, "playback_stop");
  // REST body field is call_control_id (the SDK renames it to
  // call_control_id_to_bridge_with only to dodge the path parameter).
  let ok = false;
  try {
    ok = await callAction(call.agentCallId, "bridge", {
      call_control_id: call.telnyxCallId,
      client_state: encodeState({ callId: call.id, leg: "agent", stage: "bridged" }),
    });
  } catch (err) {
    console.error("[voice] bridge failed:", err);
  }
  if (ok) {
    await prisma.call.updateMany({ where: { id: call.id, status: "RINGING" }, data: { status: "IN_PROGRESS", answeredAt: new Date() } });
    await advanceLeadForCall(call, "IN_PROGRESS", call.direction);
    // Atlas was asked for before they answered: listen from the first word.
    if (call.atlasNotesState === "armed") await beginTranscription(call.id, call.telnyxCallId).catch((e) => console.error("[voice] armed transcription failed:", e));
    return;
  }
  // Nobody stays stranded on ringback: the cell leg is dropped and an inbound
  // caller gets voicemail; an outbound customer leg is hung up.
  await callAction(call.agentCallId, "hangup");
  if (call.direction === "INBOUND") await toVoicemail(call);
  else await callAction(call.telnyxCallId, "hangup");
}

async function onGatherEnded(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  if (!hit || hit.leg !== "agent") return;
  const { call } = hit;
  if (call.status !== "RINGING") return;
  // The cell hung up mid-whisper: call.hangup for that leg does the rest.
  if (p.status === "call_hangup") return;
  const accepted = p.digits === "1";

  if (call.direction === "INBOUND") {
    if (accepted) return bridgeLegs(call);
    await callAction(call.agentCallId!, "hangup");
    return toVoicemail(call);
  }

  // Outbound: 1 = place the customer leg now, the owner hears ringback meanwhile.
  if (!accepted || !call.company.lineNumber) {
    await callAction(call.agentCallId!, "hangup");
    await prisma.call.updateMany({
      where: { id: call.id, status: "RINGING" },
      data: { status: "FAILED", hangupCause: "not_accepted", endedAt: new Date() },
    });
    return;
  }
  return dialCustomer(call);
}

/** Outbound: ring the customer from the line while the agent (cell or browser) hears ringback. The telnyxCallId claim is the lock. */
async function dialCustomer(call: CallRow): Promise<void> {
  if (!call.agentCallId || !call.company.lineNumber) return;
  const claimed = await prisma.call.updateMany({ where: { id: call.id, telnyxCallId: null }, data: { telnyxCallId: `pending:${call.id}` } });
  if (claimed.count === 0) return;
  await callAction(call.agentCallId!, "playback_start", { audio_url: ringbackUrl(), loop: "infinity" });
  try {
    const leg = await dialCall({
      to: call.customerNumber,
      from: call.company.lineNumber,
      clientState: encodeState({ callId: call.id, leg: "customer", stage: "ring" }),
      timeoutSecs: CUSTOMER_RING_SECS,
      linkTo: call.agentCallId!,
      commandId: `${call.id}:customer`,
    });
    await prisma.call.update({
      where: { id: call.id },
      data: { telnyxCallId: leg.call_control_id, customerLegId: leg.call_leg_id ?? null },
    });
  } catch (err) {
    console.error("[voice] dialing the customer failed:", err);
    await prisma.call.update({
      where: { id: call.id },
      data: { telnyxCallId: null, status: "FAILED", hangupCause: "dial_failed", endedAt: new Date() },
    });
    await callAction(call.agentCallId!, "playback_stop");
    await callAction(call.agentCallId!, "speak", {
      payload: "Sorry, that call could not be placed.",
      ...TTS,
      client_state: encodeState({ callId: call.id, leg: "agent", stage: "out_no_answer" }),
    });
  }
}

async function onSpeakEnded(p: VoiceEventPayload): Promise<void> {
  const state = decodeState(p.client_state);
  if (!state || !p.call_control_id) return;
  if (state.stage === "vm_greeting" && state.leg === "customer") {
    await callAction(p.call_control_id, "record_start", {
      format: "mp3",
      channels: "single",
      play_beep: true,
      max_length: VOICEMAIL_MAX_SECS,
      timeout_secs: 10,
      client_state: encodeState({ ...state, stage: "vm_record" }),
    });
    return;
  }
  if (state.stage === "out_no_answer" && state.leg === "agent") {
    await callAction(p.call_control_id, "hangup");
  }
}

async function onHangup(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  if (!hit) {
    const st = decodeState(p.client_state);
    console.info(`[voice] hangup for a leg we don't hold: ${p.call_control_id} cause=${p.hangup_cause ?? "-"} state=${st ? `${st.leg}/${st.stage ?? "-"} call=${st.callId}` : "-"}`);
    return;
  }
  const { call, leg, appLeg } = hit;
  const now = new Date();
  const cause = p.hangup_cause ?? null;

  if (leg === "customer") {
    const status = statusAfterCustomerHangup(call, cause);
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status,
        hangupCause: call.hangupCause ?? cause,
        endedAt: call.endedAt ?? now,
        durationSec: call.durationSec ?? talkSeconds(call.answeredAt, now),
      },
    });
    fireCallStatus(call, status);
    await advanceLeadForCall(call, status, call.direction);
    if (call.direction === "INBOUND") {
      // Caller gone while the cell / the browsers were still ringing.
      if (call.status === "RINGING") {
        if (call.agentCallId && !call.agentCallId.startsWith("pending:")) await callAction(call.agentCallId, "hangup");
        await hangupAppLegs(call.id, null);
      }
      if (status === "MISSED" && call.status !== "MISSED") await notifyMissed(call);
    } else if (call.status === "RINGING" && call.agentCallId) {
      await callAction(call.agentCallId, "playback_stop");
      if (call.via === "app") {
        // The browser's own card already says "No answer" — no voice in the headset, just drop its leg.
        await callAction(call.agentCallId, "hangup");
      } else {
        // The cell has no screen to read: tell the owner, then drop their leg.
        await callAction(call.agentCallId, "speak", {
          payload: status === "NO_ANSWER" ? "No answer." : "The call could not be connected.",
          ...TTS,
          client_state: encodeState({ callId: call.id, leg: "agent", stage: "out_no_answer" }),
        });
      }
    }
    // Atlas was listening: the transcript is complete now — write the notes, or hold them for a save.
    await finishAtlasNotes(call);
    return;
  }

  if (leg === "app" && appLeg) {
    // One browser timed out (a Decline went through declineCall first and the
    // call is already VOICEMAIL). When the last one has, the cell rings (the
    // caller's ringback is still looping). agentCallId already set = another
    // browser won, or the cell is ringing: nothing to do.
    console.info(`[voice] app leg ended call=${call.id} user=${appLeg.userId} cause=${cause ?? "-"} status=${call.status} agent=${call.agentCallId ?? "-"}`);
    await prisma.callLeg.update({ where: { id: appLeg.id }, data: { endedAt: now, hangupCause: cause } }).catch(() => {});
    if (call.status !== "RINGING" || call.direction !== "INBOUND" || call.agentCallId) return;
    const open = await prisma.callLeg.count({ where: { callId: call.id, endedAt: null } });
    if (open > 0) return;
    // An iPhone that a push woke was showing this call on its lock screen
    // and let it ring out: voicemail, never the cell — that cell IS this
    // phone, and a second ring would land on top of the CallKit call.
    if (decodeState(p.client_state)?.woke) {
      // A leg that died within seconds without ringing (480: the phone's
      // registration had gone stale) is not "rang out": the phone
      // re-registers and asks again, so the call stays ringing for it.
      const row = await prisma.callLeg.findUnique({ where: { id: appLeg.id }, select: { createdAt: true } });
      const legAgeMs = row ? now.getTime() - row.createdAt.getTime() : Infinity;
      if (cause !== "timeout" && legAgeMs < 8000) {
        console.info(`[voice] woken leg died in ${Math.round(legAgeMs / 1000)} s (${cause}); the call stays ringing for the phone to try again`);
        return;
      }
      return toVoicemail(call);
    }
    // A browser leg ran out while a pushed phone may still be waking: leave
    // the call ringing for it; scheduleCellFallback decides at the window's end.
    if (call.appRingAt && Date.now() - call.appRingAt.getTime() < (VOIP_WAKE_SECS + 3) * 1000 && (await voipTargetsFor(call.companyId)).length > 0) return;
    return dialCell(call, { ringback: false });
  }

  // Agent leg: the cell, or the browser that won / placed the call
  await prisma.callLeg.updateMany({ where: { telnyxCallId: p.call_control_id, endedAt: null }, data: { endedAt: now, hangupCause: cause } }).catch(() => {});
  if (call.status !== "RINGING") return; // bridged: the customer leg's hangup closes the row
  if (call.direction === "INBOUND") return toVoicemail(call);
  const status = unansweredOutboundStatus(call);
  await prisma.call.update({
    where: { id: call.id },
    data: { status, hangupCause: cause ?? "agent_hangup", endedAt: now },
  });
  await advanceLeadForCall(call, status, call.direction);
  if (call.telnyxCallId && !call.telnyxCallId.startsWith("pending:")) await callAction(call.telnyxCallId, "hangup");
}

/** Inbound only. Runs once per call (RINGING → VOICEMAIL is the lock). */
async function toVoicemail(call: CallRow): Promise<void> {
  if (!call.telnyxCallId) return;
  const claimed = await prisma.call.updateMany({ where: { id: call.id, status: "RINGING" }, data: { status: "VOICEMAIL" } });
  if (claimed.count === 0) return;
  await callAction(call.telnyxCallId, "playback_stop");
  await callAction(call.telnyxCallId, "speak", {
    payload: greetingFor(call.company.name, call.company.lineVoicemailGreeting),
    ...TTS,
    client_state: encodeState({ callId: call.id, leg: "customer", stage: "vm_greeting" }),
  });
}

async function onRecordingSaved(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  if (!hit || hit.leg !== "customer") return;
  const { call } = hit;
  const started = p.recording_started_at ? Date.parse(p.recording_started_at) : NaN;
  const ended = p.recording_ended_at ? Date.parse(p.recording_ended_at) : NaN;
  const secs = Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.round((ended - started) / 1000)) : null;
  const empty = secs !== null && secs < VOICEMAIL_MIN_SECS;
  await prisma.call.update({
    where: { id: call.id },
    data: {
      voicemailRecordingId: empty ? null : (p.recording_id ?? call.voicemailRecordingId ?? null),
      voicemailSec: empty ? null : secs,
      status: empty ? "MISSED" : "VOICEMAIL",
    },
  });
  // A real recording is the moment a voicemail exists; an empty one is a missed call
  if (empty) fireCallStatus(call, "MISSED");
  else fireAutomations(call.companyId, "call.voicemail", call.id);
  // Silence timeout ended the recording with the caller still there.
  await callAction(call.telnyxCallId!, "hangup");
  if (empty) {
    if (call.status !== "MISSED") await notifyMissed(call);
  } else {
    await notifyTeam(call.companyId, {
      title: `Voicemail · ${call.company.name}`,
      body: `${displayParty(call)} left a ${secs !== null ? fmtDuration(secs) + " " : ""}message.`,
      url: "/app/calls",
      tag: `call-${call.id}`,
    });
  }
}

/**
 * A transcript segment while Atlas is taking notes (lib/call-notes.ts). Only
 * Google's engine sends interim results (is_final: false, off by default);
 * the Whisper engine sends finished segments that may carry no flag at all,
 * so anything not explicitly interim is kept. Every event is logged: the
 * first live run produced an empty transcript with nothing to go on.
 */
async function onTranscription(p: VoiceEventPayload): Promise<void> {
  const d = p.transcription_data;
  const text = d?.transcript ?? "";
  console.info(`[voice] transcription ${p.call_control_id ?? "?"} final=${d?.is_final ?? "-"} track=${d?.transcription_track ?? "-"} chars=${text.length}`);
  if (!d || d.is_final === false) return;
  const line = transcriptLine(d.transcription_track, text);
  if (!line) return;
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  if (!hit) {
    console.info(`[voice] transcription for a leg we don't hold: ${p.call_control_id}`);
    return;
  }
  await appendTranscript(hit.call.id, line);
}

/* ───────────────────────── Atlas notes ───────────────────────── */

const notesSelect = { id: true, status: true, contactId: true, telnyxCallId: true, atlasNotesState: true, atlasNotes: true, atlasNotesError: true, atlasNotesTokens: true } as const;
type NotesRow = { id: string; status: CallStatus; contactId: string | null; telnyxCallId: string | null; atlasNotesState: string | null; atlasNotes: string | null; atlasNotesError: string | null; atlasNotesTokens: number | null };

const notesSnapshot = (c: NotesRow): AtlasNotesSnapshot => ({
  state: (c.atlasNotesState as AtlasNotesSnapshot["state"]) ?? null,
  notes: c.atlasNotes,
  error: c.atlasNotesError,
  tokens: c.atlasNotesTokens,
});

const realLeg = (ccid: string | null | undefined): ccid is string => Boolean(ccid && !ccid.startsWith("pending:"));

/**
 * Telnyx `transcription_start` on the customer leg — both tracks, so the
 * customer (inbound) and the team member (outbound) both land in the
 * transcript. The documented shape: the engine named twice (top level and
 * inside its config), Whisper large for phone audio. The row flips to
 * "listening" only once Telnyx accepted the command.
 */
async function beginTranscription(callId: string, telnyxCallId: string | null): Promise<void> {
  if (!realLeg(telnyxCallId)) throw new VoiceError("The call isn't connected.", 409);
  const ok = await callAction(telnyxCallId, "transcription_start", {
    transcription_engine: "Telnyx",
    transcription_engine_config: { transcription_engine: "Telnyx", language: "en", transcription_model: "openai/whisper-large-v3-turbo" },
    transcription_tracks: "both",
    client_state: encodeState({ callId, leg: "customer", stage: "bridged" }),
    command_id: `${callId}:transcribe:${Date.now()}`,
  });
  if (!ok) throw new VoiceError("The call already ended.", 409);
  await prisma.call.updateMany({ where: { id: callId, atlasNotesState: { in: ["armed", "done", "failed"] } }, data: { atlasNotesState: "listening", atlasNotesError: null } });
  await prisma.call.updateMany({ where: { id: callId, atlasNotesState: null }, data: { atlasNotesState: "listening", atlasNotesError: null } });
  console.info(`[voice] transcription started call=${callId}`);
}

/**
 * "Let Atlas take notes" on the call screen. Before they answer (RINGING)
 * the call is *armed* and transcription starts at the bridge, so the whole
 * conversation is on record; on a connected call it starts now. Remembers
 * who asked so their company's meter pays for the summary — the same gate
 * as every other Atlas surface (lib/assistant-access.ts). No tokens are
 * spent here: the summary comes at the end, and only for a saved contact
 * (finishAtlasNotes).
 */
export async function startAtlasNotes(companyId: string, callId: string, userId: string): Promise<AtlasNotesSnapshot> {
  if (!voiceEnabled()) throw new VoiceError("Calling from the app isn't available on this server yet.", 503);
  if (!aiEnabled()) throw new VoiceError("The assistant isn't available right now.", 503);
  const [call, company] = await Promise.all([
    prisma.call.findFirst({ where: { id: callId, companyId }, select: notesSelect }),
    prisma.company.findUnique({ where: { id: companyId }, select: { ...ATLAS_ACCESS_SELECT, assistantName: true } }),
  ]);
  if (!call || !company) throw new VoiceError("Call not found.", 404);
  const name = company.assistantName || "Atlas";
  const s = call.atlasNotesState;
  if (s === "armed" || s === "listening" || s === "summarizing" || s === "awaiting_contact") return notesSnapshot(call);
  const access = atlasAccess(company);
  if (access.level === "off") throw new VoiceError("The AI assistant isn't included on this account.", 403);
  if (access.level === "locked") {
    const when = new Date(access.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    throw new VoiceError(`${name} has used this ${access.reason === "plan-spent" ? "period's" : "month's"} tokens — the meter refills on ${when}.`, 403);
  }
  if (call.status === "RINGING") {
    // Not connected yet: arm it, bridgeLegs starts the transcription.
    const armed = await prisma.call.updateMany({
      where: { id: call.id, status: "RINGING" },
      data: { atlasNotesState: "armed", atlasNotesUserId: userId, atlasNotesError: null },
    });
    if (armed.count === 0) return startAtlasNotes(companyId, callId, userId); // it connected meanwhile
    return { state: "armed", notes: call.atlasNotes, error: null, tokens: call.atlasNotesTokens };
  }
  if (call.status !== "IN_PROGRESS" || !realLeg(call.telnyxCallId)) {
    throw new VoiceError(`${name} can only take notes while the call is ringing or connected.`, 409);
  }
  // Who pays, before Telnyx is told. A second start after "done" keeps the
  // earlier transcript and appends — the next summary covers the whole call.
  await prisma.call.update({ where: { id: call.id }, data: { atlasNotesUserId: userId, atlasNotesError: null } });
  try {
    await beginTranscription(call.id, call.telnyxCallId);
  } catch (err) {
    if (err instanceof VoiceError) throw err;
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    throw new VoiceError(`Telnyx couldn't start transcribing: ${detail}`, 424);
  }
  return { state: "listening", notes: call.atlasNotes, error: null, tokens: call.atlasNotesTokens };
}

/**
 * The transcript is complete (the customer leg hung up, Stop, the stale
 * sweep): write the notes if the caller is someone saved — otherwise hold
 * the transcript as "awaiting_contact" until they are saved as a lead or
 * client (advanceLeadForLinkedCalls then summarizes) or discarded. Atlas
 * tokens are never spent on a stranger's call. An armed call that never
 * connected simply forgets the request.
 */
async function finishAtlasNotes(call: { id: string; contactId: string | null; atlasNotesState: string | null }): Promise<AtlasNotesSnapshot | null> {
  if (call.atlasNotesState === "armed") {
    await prisma.call.updateMany({ where: { id: call.id, atlasNotesState: "armed" }, data: { atlasNotesState: null } });
    return null;
  }
  if (call.atlasNotesState !== "listening") return null;
  if (call.contactId) return summarizeCallNotes(call.id).catch(() => null);
  await prisma.call.updateMany({ where: { id: call.id, atlasNotesState: "listening" }, data: { atlasNotesState: "awaiting_contact" } });
  return null;
}

/** Stop listening now. Armed → forgotten; listening → the transcript is closed and finished like a hangup (notes for a saved caller, held for an unsaved one). */
export async function stopAtlasNotes(companyId: string, callId: string): Promise<AtlasNotesSnapshot> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, select: notesSelect });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (call.atlasNotesState === "listening" && voiceEnabled() && realLeg(call.telnyxCallId)) {
    await callAction(call.telnyxCallId, "transcription_stop").catch((e) => console.error("[voice] transcription_stop failed:", e));
  }
  const out = await finishAtlasNotes(call);
  if (out) return out;
  const fresh = await prisma.call.findFirst({ where: { id: callId, companyId }, select: notesSelect });
  return fresh ? notesSnapshot(fresh) : notesSnapshot(call);
}

/** "Discard": an unsaved caller's transcript is dropped, nothing is written, no tokens spent. */
export async function discardAtlasNotes(companyId: string, callId: string): Promise<AtlasNotesSnapshot> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, select: notesSelect });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (call.atlasNotesState === "listening" && voiceEnabled() && realLeg(call.telnyxCallId)) {
    await callAction(call.telnyxCallId, "transcription_stop").catch(() => null);
  }
  await prisma.call.updateMany({
    where: { id: call.id, atlasNotesState: { in: ["armed", "listening", "awaiting_contact", "failed"] } },
    data: { atlasNotesState: null, transcript: null, atlasNotesError: null },
  });
  const fresh = await prisma.call.findFirst({ where: { id: callId, companyId }, select: notesSelect });
  return fresh ? notesSnapshot(fresh) : notesSnapshot(call);
}

/* ───────────────────────── Notifications ───────────────────────── */

function displayParty(call: CallRow): string {
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  return name || fmtPhone(call.customerNumber) || "Unknown caller";
}

export function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function notifyMissed(call: CallRow): Promise<void> {
  await notifyTeam(call.companyId, {
    title: `Missed call · ${call.company.name}`,
    body: `${displayParty(call)} called your business line and hung up.`,
    url: "/app/calls",
    tag: `call-${call.id}`,
  });
}

async function notifyTeam(companyId: string, payload: { title: string; body: string; url: string; tag: string }): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { companyId, isActive: true, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    });
    await notifyUsers(
      users.map((u) => u.id),
      payload
    );
  } catch (err) {
    console.error("[voice] push failed:", err);
  }
}

/* ───────────────────────── Outbound (click to call) ───────────────────────── */

/**
 * Ring the signed-in user's cell from the business number, whisper who
 * they're about to call, then ring the customer and bridge. Returns as soon
 * as the cell leg is dialed; the rest is webhooks.
 */
export async function startOutboundCall(
  companyId: string,
  userId: string,
  target: { contactId?: string | null; to?: string | null },
  opts: { via?: "cell" | "app"; device?: "browser" | "ios" } = {}
): Promise<{ callId: string; via: "cell" | "app"; agentNumber: string | null; customerNumber: string }> {
  if (!voiceEnabled()) throw new VoiceError("Calling from the app isn't available on this server yet.", 503);
  const [company, user] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, addonActiveAt: true, lineNumber: true, lineNumberId: true, lineForwardTo: true, lineVoiceAppAt: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }),
  ]);
  if (!company) throw new VoiceError("Company not found.", 404);
  if (!hasAddon(company)) throw new VoiceError("Calling from your business line is part of Workbench Plus.", 402);
  if (!isRealLineNumber(company.lineNumber)) throw new VoiceError("Get a business line first (Settings → Phone & texting).", 409);
  if (!company.lineVoiceAppAt && !(await ensureVoiceRouting(companyId))) {
    throw new VoiceError("Your line isn't on the voice app yet — try again in a minute.", 503);
  }
  const via = opts.via ?? "cell";
  // The device placing the call gets the leg: the iPhone app names itself
  // (its own credential, no heartbeat — the INVITE for its call wakes it);
  // anything else is a registered browser.
  const softphone =
    via !== "app" ? null : opts.device === "ios" ? await voipRegisteredSoftphone(userId) : (await userSoftphoneOnline(userId)) ?? (await voipRegisteredSoftphone(userId));
  if (via === "app" && !softphone) throw new VoiceError("Your softphone isn't connected — reload the page, or call from your cell.", 409);
  const agentNumber = via === "app" ? null : (toE164(user?.phone) ?? company.lineForwardTo);
  if (via === "cell" && !agentNumber) throw new VoiceError("Add your cell number under Settings → My Profile so we can ring you first.", 409);

  let customerNumber: string | null = null;
  let contactId: string | null = null;
  let calleeName = "";
  if (target.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: target.contactId, companyId },
      select: { id: true, phone: true, firstName: true, lastName: true },
    });
    if (!contact) throw new VoiceError("Client not found.", 404);
    customerNumber = toE164(contact.phone);
    contactId = contact.id;
    calleeName = `${contact.firstName} ${contact.lastName}`.trim();
    if (!customerNumber) throw new VoiceError("This client has no dialable phone number.");
  } else {
    customerNumber = toE164(target.to);
    if (!customerNumber) throw new VoiceError("Enter a valid phone number to call.");
    const digits = phoneDigits(customerNumber);
    const match = digits
      ? await prisma.contact.findFirst({
          where: { companyId, phoneDigits: digits },
          orderBy: { updatedAt: "desc" },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;
    contactId = match?.id ?? null;
    calleeName = match ? `${match.firstName} ${match.lastName}`.trim() : "";
  }
  if (customerNumber === company.lineNumber) throw new VoiceError("That's your own business line.");
  if (customerNumber === agentNumber) {
    throw new VoiceError("That's the phone we'd ring you on first, so it can't also be the one we call. To call your own number, place the call from the browser (Calls in the app).");
  }

  const call = await prisma.call.create({
    data: {
      companyId,
      contactId,
      userId,
      direction: "OUTBOUND",
      status: "RINGING",
      customerNumber,
      customerDigits: phoneDigits(customerNumber),
      agentNumber,
      via,
    },
    select: { id: true },
  });
  try {
    const leg = await dialCall(
      softphone
        ? {
            // The browser auto-answers its own outbound call (components/Softphone.tsx matches X-WB-Call-Id).
            to: sipUri(softphone.sipUsername),
            from: company.lineNumber,
            fromDisplayName: sipDisplayName(calleeName || customerNumber),
            customHeaders: [
              { name: "X-WB-Call-Id", value: call.id },
              { name: "X-WB-Outbound", value: "1" },
            ],
            clientState: encodeState({ callId: call.id, leg: "agent", stage: "ring", userId }),
            timeoutSecs: APP_OUTBOUND_RING_SECS,
            commandId: `${call.id}:agent`,
          }
        : {
            to: agentNumber!,
            from: company.lineNumber,
            clientState: encodeState({ callId: call.id, leg: "agent", stage: "ring" }),
            timeoutSecs: AGENT_RING_SECS,
            commandId: `${call.id}:agent`,
          }
    );
    await prisma.call.update({ where: { id: call.id }, data: { agentCallId: leg.call_control_id } });
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    await prisma.call.update({ where: { id: call.id }, data: { status: "FAILED", hangupCause: "dial_failed", endedAt: new Date() } });
    if (isInsufficientFunds(err)) {
      await alertTelnyxFunds(`outbound call from ${company.lineNumber}`);
      throw new VoiceError(VOICE_PAUSED_MESSAGE, 424);
    }
    throw new VoiceError(`Telnyx couldn't place the call: ${detail}`, 424);
  }
  return { callId: call.id, via, agentNumber, customerNumber };
}

/**
 * Hang up a live call from the app (DELETE /api/app/line/call): every leg
 * Telnyx still has is dropped; a row that was still RINGING closes here
 * (the hangup webhooks would only re-confirm it). Idempotent — a call that
 * already ended is reported as such.
 */
/**
 * Decline in the browser: straight to voicemail, like a phone. Voicemail is
 * claimed first (RINGING → VOICEMAIL) so the app legs' hangup webhooks —
 * which ring the cell when the last browser merely drops — find a call that
 * is no longer ringing. Only for an inbound call nobody has picked up yet.
 */
export async function declineCall(companyId: string, callId: string): Promise<{ status: CallStatus }> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (call.direction !== "INBOUND" || call.status !== "RINGING" || call.agentCallId) return { status: call.status };
  await toVoicemail(call);
  await hangupAppLegs(call.id, null).catch(() => {});
  return { status: "VOICEMAIL" };
}

export async function cancelCall(companyId: string, callId: string): Promise<{ status: CallStatus }> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId } });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (isTerminalStatus(call.status)) return { status: call.status };
  if (voiceEnabled()) {
    for (const ccid of [call.agentCallId, call.telnyxCallId]) {
      if (ccid && !ccid.startsWith("pending:")) await callAction(ccid, "hangup").catch((e) => console.error("[voice] cancel hangup failed:", e));
    }
    await hangupAppLegs(call.id, null).catch(() => {});
  }
  if (call.status !== "RINGING") return { status: call.status }; // bridged: the customer leg's hangup closes the row
  const now = new Date();
  const status: CallStatus = call.direction === "INBOUND" ? "MISSED" : unansweredOutboundStatus(call);
  const claimed = await prisma.call.updateMany({
    where: { id: call.id, status: "RINGING" },
    data: { status, hangupCause: "cancelled", endedAt: now },
  });
  await prisma.callLeg.updateMany({ where: { callId: call.id, endedAt: null }, data: { endedAt: now, hangupCause: "cancelled" } });
  if (claimed.count > 0) {
    fireCallStatus(call, status);
    await advanceLeadForCall(call, status, call.direction);
  }
  return { status };
}

/**
 * The pause button in the browser: the SDK's hold only quiets our leg, so the
 * other party would sit in silence. Play the hold loop on their leg instead
 * (telnyxCallId is the customer in both directions) and stop it on unhold.
 */
export async function setHoldMusic(companyId: string, callId: string, on: boolean): Promise<{ held: boolean }> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, select: { status: true, telnyxCallId: true } });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (!voiceEnabled() || call.status !== "IN_PROGRESS" || !call.telnyxCallId || call.telnyxCallId.startsWith("pending:")) {
    return { held: false };
  }
  if (on) await callAction(call.telnyxCallId, "playback_start", { audio_url: holdMusicUrl(), loop: "infinity" });
  else await callAction(call.telnyxCallId, "playback_stop");
  return { held: on };
}

/* ───────────────────────── Voicemail playback ───────────────────────── */

/** A short-lived MP3 URL for a call's voicemail, or null when there's nothing to play. */
export async function voicemailUrl(call: Pick<Call, "voicemailRecordingId" | "customerLegId">): Promise<string | null> {
  if (!voiceEnabled()) return null;
  if (call.voicemailRecordingId) {
    const rec = await getRecording(call.voicemailRecordingId);
    if (rec?.download_urls?.mp3) return rec.download_urls.mp3;
  }
  if (call.customerLegId) {
    const recs = await listRecordingsForLeg(call.customerLegId);
    const hit = recs.find((r) => r.download_urls?.mp3);
    return hit?.download_urls?.mp3 ?? null;
  }
  return null;
}

/* ───────────────────────── Housekeeping ───────────────────────── */

/** Hourly: close rows whose hangup webhook never arrived; downgrade empty voicemails. */
export async function runStaleCallSweep(now = new Date()): Promise<{ closed: number; emptied: number }> {
  const out = { closed: 0, emptied: 0 };
  const rows = await prisma.call.findMany({
    where: {
      OR: [
        { status: "RINGING", createdAt: { lt: new Date(now.getTime() - STALE_RINGING_MS) } },
        { status: "IN_PROGRESS", createdAt: { lt: new Date(now.getTime() - STALE_IN_PROGRESS_MS) } },
        { status: "VOICEMAIL", voicemailRecordingId: null, createdAt: { lt: new Date(now.getTime() - STALE_VOICEMAIL_MS) } },
      ],
    },
    take: 200,
  });
  for (const call of rows) {
    const action = staleCallPlan(call, now);
    if (!action) continue;
    if (action === "close") {
      const status: CallStatus = call.status === "IN_PROGRESS" ? "COMPLETED" : call.direction === "INBOUND" ? "MISSED" : "FAILED";
      await prisma.call.update({
        where: { id: call.id },
        data: { status, hangupCause: call.hangupCause ?? "stale", endedAt: call.endedAt ?? now, durationSec: call.durationSec ?? talkSeconds(call.answeredAt, now) },
      });
      // Only a RINGING row gets its legs dropped at Telnyx. A bridged call
      // this old is already gone (Telnyx's own 4 h cap) — and housekeeping
      // must never be the thing that hangs up on a customer.
      if (call.status === "RINGING" && voiceEnabled()) {
        for (const ccid of [call.telnyxCallId, call.agentCallId]) {
          if (ccid && !ccid.startsWith("pending:")) await callAction(ccid, "hangup").catch(() => {});
        }
        await hangupAppLegs(call.id, null).catch(() => {});
      }
      await prisma.callLeg.updateMany({ where: { callId: call.id, endedAt: null }, data: { endedAt: now, hangupCause: "stale" } });
      await finishAtlasNotes(call);
      fireCallStatus(call, status);
      out.closed++;
    } else {
      await prisma.call.update({ where: { id: call.id }, data: { status: "MISSED" } });
      fireCallStatus(call, "MISSED");
      out.emptied++;
    }
  }
  return out;
}

/** The Calls page was opened: everything finished is now seen. */
export async function markCallsSeen(companyId: string, scope: Record<string, unknown> = {}): Promise<void> {
  // `scope` = the viewer's call visibility (the Calls page's where clause):
  // a salesperson opening their own list must not mark the whole company's
  // missed calls as looked at.
  await prisma.call.updateMany({
    where: { companyId, ...scope, seenAt: null, status: { in: ["COMPLETED", "MISSED", "VOICEMAIL", "NO_ANSWER", "FAILED"] } },
    data: { seenAt: new Date() },
  });
}

/**
 * A contact was just saved with a phone number (new lead from the call
 * screen, a client added by hand, an edited number): every call from that
 * number that never matched anyone is theirs now, so the log shows a name
 * instead of digits without anybody re-saving history. Returns how many
 * rows were adopted.
 */
export async function linkCallsToContact(companyId: string, contactId: string, phone: string | null | undefined): Promise<number> {
  const digits = phoneDigits(phone);
  if (!digits) return 0;
  // The calls of the last day are remembered before the link lands: a lead
  // saved from the call screen right after hanging up has already been
  // spoken to, and the board should say so (advanceLeadForLinkedCalls).
  const recent = await prisma.call.findMany({
    where: { companyId, contactId: null, customerDigits: digits, createdAt: { gte: new Date(Date.now() - LINK_ADVANCE_WINDOW_MS) } },
    select: { id: true },
  });
  const r = await prisma.call.updateMany({
    where: { companyId, contactId: null, customerDigits: digits },
    data: { contactId },
  });
  if (recent.length) await advanceLeadForLinkedCalls(companyId, contactId, recent.map((c) => c.id)).catch(() => null);
  return r.count;
}

/** How far back a newly linked call still moves the lead's card. Older history says nothing about where they stand today. */
export const LINK_ADVANCE_WINDOW_MS = 24 * 3_600_000;

/**
 * A call was just tied to a contact — from the call screen's Save as a lead
 * (POST contacts → linkCallsToContact), its explicit "this is them" link
 * (PATCH /api/app/calls/[id]), or an edited phone number. The call's own
 * hooks (bridge, hangup) ran while the row had no contact, so the Leads
 * board never heard about it: fire the trigger now for the latest of those
 * calls. autoAdvance is forward-only and the board's own automation
 * columns decide where the card goes — a board with no "you call or text
 * them" column moves nothing, by its owner's choice.
 */
export async function advanceLeadForLinkedCalls(companyId: string, contactId: string, callIds: string[]): Promise<void> {
  if (callIds.length === 0) return;
  const latest = await prisma.call.findFirst({
    where: { id: { in: callIds }, companyId, contactId },
    orderBy: { createdAt: "desc" },
    select: { id: true, companyId: true, contactId: true, status: true, direction: true },
  });
  if (!latest) return;
  await advanceLeadForCall(latest, latest.status, latest.direction);
  // Atlas held a transcript for an unsaved caller: they're saved now, write the notes.
  const waiting = await prisma.call.findMany({
    where: { id: { in: callIds }, companyId, contactId, atlasNotesState: "awaiting_contact" },
    select: { id: true },
  });
  for (const w of waiting) await summarizeCallNotes(w.id).catch(() => null);
}

export type ResolvedCallContact = { id: string; firstName: string; lastName: string; status: ContactStatus };

/**
 * Self-healing for the log: rows with no contact whose number now belongs
 * to someone (contacts created by a booking form, the lead webhook, a CSV
 * import — anything that didn't go through linkCallsToContact). Returns
 * digits → contact for the caller to patch into its rows, and persists the
 * link so the contact page's "Recent calls" and the ?contact filter agree.
 */
export async function resolveCallContacts(companyId: string, digitsList: Array<string | null | undefined>): Promise<Map<string, ResolvedCallContact>> {
  const digits = [...new Set(digitsList.filter((d): d is string => Boolean(d)))];
  const out = new Map<string, ResolvedCallContact>();
  if (digits.length === 0) return out;
  const contacts = await prisma.contact.findMany({
    where: { companyId, phoneDigits: { in: digits }, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, firstName: true, lastName: true, status: true, phoneDigits: true },
  });
  for (const c of contacts) {
    if (c.phoneDigits && !out.has(c.phoneDigits)) out.set(c.phoneDigits, { id: c.id, firstName: c.firstName, lastName: c.lastName, status: c.status });
  }
  await Promise.all(
    [...out.entries()].map(([d, c]) =>
      prisma.call.updateMany({ where: { companyId, contactId: null, customerDigits: d }, data: { contactId: c.id } }).catch(() => null)
    )
  );
  return out;
}
