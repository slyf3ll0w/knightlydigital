import { reportError } from "@/lib/report-error";
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
import { callEnding } from "@/lib/call-ending";
import { fmtPhone } from "@/lib/format";
import { phoneDigits } from "@/lib/phone";
import { notifyUsers } from "@/lib/push";
import { toE164 } from "@/lib/sms";
import { APP_OUTBOUND_RING_SECS, APP_RING_SECS, VOIP_APP_RING_SECS, canUseSoftphone, isSoftphoneOnline, onlineSoftphoneUsers, ringPlan, userSoftphoneOnline, type RingTarget, type PhoneDevice, type SoftphoneDevice, phoneSipColumn, PHONE_SIP_SELECT } from "@/lib/softphone";
import { appendTranscript, summarizeCallNotes, transcriptLine, type AtlasNotesSnapshot } from "@/lib/call-notes";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { aiEnabled } from "@/lib/ai";
import { VOIP_WAKE_SECS, phoneCredentialsOfLogin, pushIncomingCall, voipRegisteredSoftphone, voipTargetsFor } from "@/lib/voip";
import {
  MAX_PARTICIPANTS,
  PARTICIPANT_RING_SECS,
  actorLeg,
  canAddParticipant,
  handOffAfterLeave,
  holdTargets,
  inviteLine,
  isRealLegId,
  othersRemain,
  participantStatusAfterHangup,
  type ParticipantKind,
} from "@/lib/voice-conference";
import {
  TTS,
  TelnyxError,
  callAction,
  conferenceAction,
  createConference,
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

/** customer = the far party; agent = the cell, or the one browser that won / placed the call; app = a browser rung for an inbound call (or for a teammate being added); participant = a number dialed into a conference (Add a person). */
export type Leg = "customer" | "agent" | "app" | "participant";
export type Stage = "ring" | "whisper" | "bridged" | "vm_greeting" | "vm_record" | "out_whisper" | "out_no_answer" | "conference";
/** `woke`: this app leg belongs to a phone app (iPhone or Android) that a push woke for the call (lib/voip.ts). `participantId`: the CallParticipant this leg rings or is. */
export type ClientState = { callId: string; leg: Leg; stage?: Stage; userId?: string; woke?: boolean; participantId?: string };

export function encodeState(s: ClientState): string {
  return Buffer.from(JSON.stringify(s)).toString("base64");
}

export function decodeState(raw: string | null | undefined): ClientState | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ClientState>;
    if (typeof j.callId !== "string" || (j.leg !== "customer" && j.leg !== "agent" && j.leg !== "app" && j.leg !== "participant")) return null;
    return {
      callId: j.callId,
      leg: j.leg,
      stage: j.stage,
      ...(typeof j.userId === "string" ? { userId: j.userId } : {}),
      ...(j.woke === true ? { woke: true } : {}),
      ...(typeof j.participantId === "string" ? { participantId: j.participantId } : {}),
    };
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
    reportError(`[voice] lead auto-advance failed for call ${call.id}:`, err);
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
      await setCallForwarding(numberId, fallbackForwardTo).catch((e) => reportError("[voice] forwarding restore failed:", e));
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
  /** call.hangup: the SIP code behind hangup_cause ("480" = no registration behind a dialed credential) */
  sip_hangup_cause?: string;
  /** call.gather.ended */
  digits?: string;
  status?: string;
  /** call.recording.saved */
  recording_id?: string;
  recording_started_at?: string;
  recording_ended_at?: string;
  /** call.transcription (Atlas notes, lib/call-notes.ts) */
  transcription_data?: { transcript?: string; is_final?: boolean; confidence?: number; transcription_track?: string };
  /** conference.* events (Add a person): which conference the leg joined or left */
  conference_id?: string;
};

export type VoiceEvent = { event_type: string; id?: string; payload: VoiceEventPayload };

const companySelect = {
  id: true,
  name: true,
  lineNumber: true,
  lineForwardTo: true,
  lineVoicemailGreeting: true,
} as const;

/** What the call screen and the rules need of a participant (lib/voice-conference.ts ParticipantLite + the chip). */
const participantSelect = {
  id: true,
  kind: true,
  status: true,
  userId: true,
  contactId: true,
  number: true,
  label: true,
  telnyxCallId: true,
  addedByUserId: true,
  joinedAt: true,
  leftAt: true,
  createdAt: true,
} as const;

type ParticipantRow = {
  id: string;
  kind: string;
  status: string;
  userId: string | null;
  contactId: string | null;
  number: string | null;
  label: string;
  telnyxCallId: string | null;
  addedByUserId: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  createdAt: Date;
};

type CallRow = Call & {
  company: { id: string; name: string; lineNumber: string | null; lineForwardTo: string | null; lineVoicemailGreeting: string | null };
  contact: Pick<Contact, "firstName" | "lastName"> | null;
  participants: ParticipantRow[];
};

type AppLeg = { id: string; telnyxCallId: string; userId: string | null; device?: string | null; participantId?: string | null };
type LegHit = { call: CallRow; leg: Leg; appLeg: AppLeg | null; participant: ParticipantRow | null };

const callInclude = {
  company: { select: companySelect },
  contact: { select: { firstName: true, lastName: true } },
  participants: { select: participantSelect, orderBy: { createdAt: "asc" } },
} as const;

/**
 * The row behind a webhook's call_control_id: the customer leg, the agent leg
 * (the cell, or the browser that won / placed the call), one of the
 * browser legs rung for an inbound call (CallLeg) — or, once someone pressed
 * Add, a participant's dialed leg (CallParticipant). A browser leg whose row
 * hasn't landed yet — Telnyx can deliver its first event before our insert
 * commits — is adopted from the client_state stamped on the dial, so a fast
 * decline is never lost (it would leave the caller on ringback until the
 * stale sweep); a participant leg is adopted the same way.
 */
async function findCallByLeg(ccid: string | undefined, clientState?: string | null): Promise<LegHit | null> {
  if (!ccid) return null;
  const call = await prisma.call.findFirst({
    where: { OR: [{ telnyxCallId: ccid }, { agentCallId: ccid }] },
    include: callInclude,
  });
  if (call) return { call, leg: call.telnyxCallId === ccid ? "customer" : "agent", appLeg: null, participant: null };
  const appLeg = await prisma.callLeg.findUnique({
    where: { telnyxCallId: ccid },
    select: { id: true, telnyxCallId: true, userId: true, device: true, participantId: true, call: { include: callInclude } },
  });
  if (appLeg) {
    return {
      call: appLeg.call,
      leg: "app",
      appLeg: { id: appLeg.id, telnyxCallId: appLeg.telnyxCallId, userId: appLeg.userId, device: appLeg.device, participantId: appLeg.participantId },
      participant: appLeg.participantId ? (appLeg.call.participants.find((p) => p.id === appLeg.participantId) ?? null) : null,
    };
  }
  const participant = await prisma.callParticipant.findUnique({
    where: { telnyxCallId: ccid },
    select: { ...participantSelect, call: { include: callInclude } },
  });
  if (participant) {
    const { call: parent, ...row } = participant;
    return { call: parent, leg: "participant", appLeg: null, participant: row };
  }
  const state = decodeState(clientState);
  if (!state || (state.leg !== "app" && state.leg !== "participant")) return null;
  const parent = await prisma.call.findUnique({ where: { id: state.callId }, include: callInclude });
  if (!parent) return null;
  if (state.leg === "participant") {
    if (!state.participantId) return null;
    // The dial's row update hasn't landed: claim the leg for its participant.
    await prisma.callParticipant.updateMany({ where: { id: state.participantId, callId: parent.id, telnyxCallId: null }, data: { telnyxCallId: ccid } });
    const row = await prisma.callParticipant.findUnique({ where: { id: state.participantId }, select: participantSelect });
    if (!row || row.telnyxCallId !== ccid) return null;
    return { call: parent, leg: "participant", appLeg: null, participant: row };
  }
  const adopted = await prisma.callLeg.upsert({
    where: { telnyxCallId: ccid },
    create: { callId: parent.id, userId: state.userId ?? null, telnyxCallId: ccid, participantId: state.participantId ?? null },
    update: {},
    select: { id: true, telnyxCallId: true, userId: true, participantId: true },
  });
  return {
    call: parent,
    leg: "app",
    appLeg: adopted,
    participant: adopted.participantId ? (parent.participants.find((p) => p.id === adopted.participantId) ?? null) : null,
  };
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
      case "conference.participant.joined":
        return onConferenceJoined(p);
      case "conference.participant.left":
        return onConferenceLeft(p);
      case "conference.created":
      case "conference.ended":
        console.info(`[voice] ${ev.event_type} ${p.conference_id ?? "?"} state=${describeState(p.client_state)}`);
        return;
      default:
        return;
    }
  } catch (err) {
    reportError(`[voice] ${ev.event_type} failed:`, err);
  }
}

const describeState = (raw: string | null | undefined): string => {
  const st = decodeState(raw);
  return st ? `${st.leg}/${st.stage ?? "-"} call=${st.callId}` : "-";
};

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
  const { call, leg, appLeg, participant } = hit;
  // Add a person: a dialed number picked up, or a rung teammate's app answered.
  if (leg === "participant" && participant && participant.telnyxCallId) return onParticipantAnswered(call, participant.id, participant.telnyxCallId);
  if (leg === "app" && appLeg?.participantId) return onTeamLegAnswered(call, appLeg.participantId, appLeg.telnyxCallId);
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
    reportError("[voice] dialing the cell failed:", err);
    await prisma.call.update({ where: { id: call.id }, data: { agentCallId: null } });
    await toVoicemail(call);
  }
}

/** Dial every online browser as a SIP leg (one CallLeg row each). Returns how many are ringing. `woke` = these are pushed phones (longer ring, voicemail instead of the cell when it runs out). `invite` = these legs ring a teammate being ADDED to a live call (CallParticipant). */
async function ringSoftphones(call: CallRow, targets: RingTarget[], woke = false, invite?: { participantId: string; label: string }): Promise<number> {
  let ringing = 0;
  const label = invite?.label ?? displayParty(call);
  for (const [i, t] of targets.entries()) {
    const device = t.device ?? (woke ? "ios" : "browser");
    try {
      const leg = await dialCall({
        to: sipUri(t.sipUsername),
        from: call.company.lineNumber!,
        fromDisplayName: sipDisplayName(label),
        customHeaders: [{ name: "X-WB-Call-Id", value: call.id }],
        clientState: encodeState({
          callId: call.id,
          leg: "app",
          stage: "ring",
          userId: t.userId,
          ...(woke ? { woke: true } : {}),
          ...(invite ? { participantId: invite.participantId } : {}),
        }),
        timeoutSecs: woke ? VOIP_APP_RING_SECS : APP_RING_SECS,
        linkTo: call.telnyxCallId!,
        // command_id is Telnyx's idempotency key. One per call, user AND
        // device: the phone's wake leg used to share the browser leg's key,
        // so Telnyx answered the second dial with the first leg and never
        // rang the phone at all (found in the Prog. Voice Call Flow Tool —
        // the phone's leg simply did not exist).
        // A woken phone is dialed again after a 480 (scheduleWokenRedial),
        // and once per credential it may hold (dialWokenPhone) — all for the
        // same user and device, so its key is per attempt AND per target;
        // the browser fan-out keeps one key per call (the appRingAt claim
        // already stops a retried webhook ringing twice).
        commandId: invite
          ? `${call.id}:add:${invite.participantId}:${t.userId}:${device}:${Date.now()}:${i}`
          : woke
            ? `${call.id}:app:${t.userId}:${device}:${Date.now()}:${i}`
            : `${call.id}:app:${t.userId}:${device}`,
      });
      // upsert: the leg's first webhook may have adopted the row already (findCallByLeg).
      await prisma.callLeg.upsert({
        where: { telnyxCallId: leg.call_control_id },
        create: { callId: call.id, userId: t.userId, telnyxCallId: leg.call_control_id, device, participantId: invite?.participantId ?? null },
        update: { userId: t.userId, device, ...(invite ? { participantId: invite.participantId } : {}) },
      });
      ringing++;
    } catch (err) {
      reportError(`[voice] dialing softphone ${t.sipUsername} failed:`, err);
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
    })().catch((err) => reportError("[voice] cell fallback failed:", err));
  }, delayMs);
}

export type WakeOutcome = "ringing" | "already" | "late" | "ineligible";

/**
 * The phone app (iPhone or Android, `device`) is awake for a call it was
 * pushed for (POST /api/app/line/softphone/ready): dial its SIP leg now, if
 * the call is still ringing and nobody has it. "late" = it went elsewhere
 * (answered, cell already ringing, caller gone) and the app should drop the
 * system call screen.
 */
export async function wakeSoftphoneLeg(userId: string, companyId: string, callId: string, device: PhoneDevice = "ios"): Promise<WakeOutcome> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  // Add a person: the push was an invite onto a live call, not an inbound ring.
  const invite = call?.status === "IN_PROGRESS" ? call.participants.find((p) => p.kind === "team" && p.userId === userId && p.status === "ringing") : null;
  if (call && invite) return wakeTeamInvite(call, invite, userId, device);
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
  const col = phoneSipColumn(device);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...PHONE_SIP_SELECT, softphoneEnabled: true, role: true, isActive: true },
  });
  if (!user?.[col] || !user.softphoneEnabled || !user.isActive || !canUseSoftphone(user.role)) {
    console.info(`[voice] wake call=${callId}: ineligible (${device} sip=${user?.[col] ? "yes" : "no"} on=${user?.softphoneEnabled} active=${user?.isActive} role=${user?.role})`);
    return "ineligible";
  }
  const open = await prisma.callLeg.count({ where: { callId, userId, device, endedAt: null } });
  if (open > 0) return "already";
  const rang = await dialWokenPhone(call, userId, sinceRing, device);
  return rang > 0 ? "ringing" : "late";
}

/**
 * Dial the woken phone: one leg per credential of its kind it may be
 * registered as (lib/voip.ts phoneCredentialsOfLogin — its own, and its
 * siblings' when the page switched company under it). Every leg carries
 * THIS membership's userId: whichever credential picks up, the call is
 * answered by this person in this company. Returns how many legs are ringing.
 */
async function dialWokenPhone(call: CallRow, userId: string, sinceRingMs: number, device: PhoneDevice, legsBefore = 0): Promise<number> {
  const creds = await phoneCredentialsOfLogin(userId, device);
  const rang = await ringSoftphones(
    call,
    creds.map((sipUsername) => ({ userId, sipUsername, device })),
    true
  );
  console.info(
    `[voice] wake call=${call.id}: ${rang > 0 ? "ringing" : "late"} — ${rang}/${creds.length} SIP leg(s) to the ${device} phone dialed ${Math.round(sinceRingMs / 1000)} s after the push${legsBefore ? ` (again, after ${legsBefore} earlier leg(s))` : ""}`
  );
  return rang;
}

/** A woken phone whose legs died at 480 is dialed again this soon, until this many legs have been tried. */
const WOKEN_REDIAL_MS = 2000;
const WOKEN_REDIAL_MAX_LEGS = 8;
const wokenRedials = new Map<string, NodeJS.Timeout>();

/**
 * Telnyx answered the woken phone's leg with 480: no registration behind
 * that credential — it had just registered and was not routable yet, or it
 * holds a sibling credential the first dial missed. The phone cannot tell
 * (its socket is fine) and so never asks again by itself; the app build 13
 * in the field certainly doesn't. Dial it again shortly, a bounded number
 * of times, while the caller still hears ringback. One timer per call: the
 * hangups of several legs arrive together.
 */
function scheduleWokenRedial(callId: string, userId: string, device: PhoneDevice): void {
  if (wokenRedials.has(callId)) return;
  const t = setTimeout(() => {
    wokenRedials.delete(callId);
    void (async () => {
      const call = await prisma.call.findUnique({ where: { id: callId }, include: callInclude });
      if (!call || call.status !== "RINGING" || call.direction !== "INBOUND" || call.agentCallId || !call.appRingAt) return;
      const sinceRing = Date.now() - call.appRingAt.getTime();
      if (sinceRing > VOIP_WAKE_SECS * 1000) return; // the cell fallback is about to take over
      const [open, dialed] = await Promise.all([
        prisma.callLeg.count({ where: { callId, userId, device, endedAt: null } }),
        prisma.callLeg.count({ where: { callId, userId, device } }),
      ]);
      if (open > 0 || dialed >= WOKEN_REDIAL_MAX_LEGS) return;
      await dialWokenPhone(call, userId, sinceRing, device, dialed);
    })().catch((err) => reportError("[voice] woken redial failed:", err));
  }, WOKEN_REDIAL_MS);
  wokenRedials.set(callId, t);
}

/** Hang up every browser leg still ringing on a call, except the one that won. Their hangup webhooks close the rows. */
async function hangupAppLegs(callId: string, keep: string | null): Promise<void> {
  const legs = await prisma.callLeg.findMany({
    where: { callId, endedAt: null, ...(keep ? { telnyxCallId: { not: keep } } : {}) },
    select: { telnyxCallId: true },
  });
  for (const l of legs) {
    await callAction(l.telnyxCallId, "hangup").catch((e) => reportError("[voice] app leg hangup failed:", e));
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
    if (conferenceFirst(call)) {
      // VOICE_CONFERENCE_FIRST=1: an app-answered call starts life in a
      // conference instead of a bridge — the fallback if Telnyx will not
      // promote a bridged pair on the first Add (plan, spike 0). Costs a
      // conference participant-minute on every app call, hence opt-in.
      ok = await startConference(call);
    } else {
      ok = await callAction(call.agentCallId, "bridge", {
        call_control_id: call.telnyxCallId,
        client_state: encodeState({ callId: call.id, leg: "agent", stage: "bridged" }),
      });
    }
  } catch (err) {
    reportError("[voice] bridge failed:", err);
  }
  if (ok) {
    await prisma.call.updateMany({ where: { id: call.id, status: "RINGING" }, data: { status: "IN_PROGRESS", answeredAt: new Date() } });
    await advanceLeadForCall(call, "IN_PROGRESS", call.direction);
    // Atlas was asked for before they answered: listen from the first word.
    if (call.atlasNotesState === "armed") await beginTranscription(call.id, call.telnyxCallId).catch((e) => reportError("[voice] armed transcription failed:", e));
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
    reportError("[voice] dialing the customer failed:", err);
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
  const { call, leg, appLeg, participant } = hit;
  const now = new Date();
  const cause = p.hangup_cause ?? null;

  if (leg === "customer") {
    const status = statusAfterCustomerHangup(call, cause);
    // Who hung up, for a call that was connected (the agent leg's webhook may have said already)
    const endedBy = call.status === "IN_PROGRESS" && !call.endedBy ? callEnding("customer", call.direction, cause, p.hangup_source) : null;
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status,
        hangupCause: call.hangupCause ?? cause,
        endedAt: call.endedAt ?? now,
        durationSec: call.durationSec ?? talkSeconds(call.answeredAt, now),
      },
    });
    // First verdict wins: the agent leg's webhook (or cancelCall) may have
    // said who hung up in the milliseconds since this row was read.
    if (endedBy) await prisma.call.updateMany({ where: { id: call.id, endedBy: null }, data: { endedBy } }).catch(() => {});
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
    // Add a person: a conference does not end with the customer the way a
    // bridge does — drop everyone still on it (the answerer included).
    if (isRealLegId(call.conferenceId)) await endConferenceLegs(call, now, cause);
    // Atlas was listening: the transcript is complete now — write the notes, or hold them for a save.
    await finishAtlasNotes(call);
    return;
  }

  if (leg === "participant" && participant) return onParticipantLegEnded(call, participant, cause, now);

  if (leg === "app" && appLeg) {
    // One browser timed out (a Decline went through declineCall first and the
    // call is already VOICEMAIL). When the last one has, the cell rings (the
    // caller's ringback is still looping). agentCallId already set = another
    // browser won, or the cell is ringing: nothing to do.
    console.info(`[voice] app leg ended call=${call.id} user=${appLeg.userId} cause=${cause ?? "-"} status=${call.status} agent=${call.agentCallId ?? "-"}`);
    await prisma.callLeg.update({ where: { id: appLeg.id }, data: { endedAt: now, hangupCause: cause } }).catch(() => {});
    if (appLeg.participantId) return onTeamLegEnded(call, appLeg, cause, now);
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
        const sip = p.sip_hangup_cause ?? null;
        console.info(`[voice] woken leg died in ${Math.round(legAgeMs / 1000)} s (${cause}${sip ? ` sip ${sip}` : ""}); the call stays ringing for the phone`);
        if (sip === "480" && appLeg.userId) scheduleWokenRedial(call.id, appLeg.userId, appLeg.device === "android" ? "android" : "ios");
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
  if (call.status === "IN_PROGRESS" && isRealLegId(call.conferenceId) && p.call_control_id) {
    // Add a person: the answerer left a conference. Others still on it with
    // the customer → the call goes on (a teammate takes it over — that is
    // the warm transfer); nobody else → the customer must be dropped too,
    // since a conference does not end with one leg the way a bridge does.
    if (othersRemain(call, call.participants, p.call_control_id)) return onAnswererLeft(call, p.call_control_id);
    if (!call.endedBy) {
      const endedBy = callEnding("agent", call.direction, cause, p.hangup_source);
      if (endedBy) await prisma.call.updateMany({ where: { id: call.id, endedBy: null }, data: { endedBy } }).catch(() => {});
    }
    if (isRealLegId(call.telnyxCallId)) await callAction(call.telnyxCallId, "hangup");
    return;
  }
  if (call.status === "IN_PROGRESS" && !call.endedBy) {
    // Bridged: the customer leg's hangup closes the row, but this leg knows
    // which side let go — keep that if nobody has said yet.
    const endedBy = callEnding("agent", call.direction, cause, p.hangup_source);
    if (endedBy) await prisma.call.updateMany({ where: { id: call.id, endedBy: null }, data: { endedBy } }).catch(() => {});
  }
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
      title: "Voicemail", // lib/push.ts adds the company name for multi-company people
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
    await callAction(call.telnyxCallId, "transcription_stop").catch((e) => reportError("[voice] transcription_stop failed:", e));
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
    title: "Missed call", // lib/push.ts adds the company name for multi-company people
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
    reportError("[voice] push failed:", err);
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
  opts: { via?: "cell" | "app"; device?: SoftphoneDevice } = {}
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
  if (!hasAddon(company)) throw new VoiceError("Calling from your business line is part of the Voice plan.", 402);
  if (!isRealLineNumber(company.lineNumber)) throw new VoiceError("Get a business line first (Settings → Phone & texting).", 409);
  if (!company.lineVoiceAppAt && !(await ensureVoiceRouting(companyId))) {
    throw new VoiceError("Your line isn't on the voice app yet — try again in a minute.", 503);
  }
  const via = opts.via ?? "cell";
  // The device placing the call gets the leg: a phone app names itself
  // (its own credential, no heartbeat — the INVITE for its call wakes it);
  // anything else is a registered browser.
  const softphone =
    via !== "app"
      ? null
      : opts.device === "ios" || opts.device === "android"
        ? await voipRegisteredSoftphone(userId, opts.device)
        : (await userSoftphoneOnline(userId)) ?? (await voipRegisteredSoftphone(userId));
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

/**
 * `actorId` without `everyone`: on a conference with others still on it, the
 * red button means Leave — only the actor's leg drops (a phone's CallKit End
 * takes this path too, through the agent-leg hangup webhook). `everyone`
 * ends it for all.
 */
export async function cancelCall(companyId: string, callId: string, opts: { actorId?: string; everyone?: boolean } = {}): Promise<{ status: CallStatus }> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (isTerminalStatus(call.status)) return { status: call.status };
  if (call.status === "IN_PROGRESS" && isRealLegId(call.conferenceId) && !opts.everyone && opts.actorId) {
    const me = actorLeg(call, call.participants, opts.actorId);
    if (me && othersRemain(call, call.participants, me.telnyxCallId)) return leaveCall(companyId, callId, opts.actorId);
  }
  // Our side is ending a connected call: say so before the legs drop, or the
  // agent leg's hangup webhook reads the platform's own hangup as "they hung up".
  if (call.status === "IN_PROGRESS") {
    await prisma.call.updateMany({ where: { id: call.id, endedBy: null }, data: { endedBy: "us" } }).catch(() => {});
  }
  if (voiceEnabled()) {
    for (const ccid of [call.agentCallId, call.telnyxCallId]) {
      if (ccid && !ccid.startsWith("pending:")) await callAction(ccid, "hangup").catch((e) => reportError("[voice] cancel hangup failed:", e));
    }
    await hangupAppLegs(call.id, null).catch(() => {});
    await hangupParticipantLegs(call, new Date(), "cancelled").catch(() => {});
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
export async function setHoldMusic(companyId: string, callId: string, on: boolean, actorId?: string): Promise<{ held: boolean }> {
  const call = await prisma.call.findFirst({
    where: { id: callId, companyId },
    select: { status: true, direction: true, via: true, userId: true, answeredByUserId: true, telnyxCallId: true, agentCallId: true, conferenceId: true, participants: { select: participantSelect } },
  });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (!voiceEnabled() || call.status !== "IN_PROGRESS" || !call.telnyxCallId || call.telnyxCallId.startsWith("pending:")) {
    return { held: false };
  }
  if (isRealLegId(call.conferenceId)) {
    // Add a person: everyone but the one pressing the button hears the music
    // (the conference's own hold takes their legs out of the mix meanwhile).
    const me = actorId ? actorLeg(call, call.participants, actorId) : null;
    const targets = holdTargets(call, call.participants, me?.telnyxCallId ?? null);
    if (targets.length === 0) return { held: false };
    try {
      if (on) await conferenceAction(call.conferenceId, "hold", { call_control_ids: targets, audio_url: holdMusicUrl() });
      else await conferenceAction(call.conferenceId, "unhold", { call_control_ids: targets });
    } catch (err) {
      const detail = err instanceof TelnyxError ? err.detail : "unknown error";
      throw new VoiceError(`Telnyx couldn't ${on ? "hold" : "resume"} the call: ${detail}`, 424);
    }
    return { held: on };
  }
  if (on) await callAction(call.telnyxCallId, "playback_start", { audio_url: holdMusicUrl(), loop: "infinity" });
  else await callAction(call.telnyxCallId, "playback_stop");
  return { held: on };
}

/* ───────────────────────── Add a person (conference) ───────────────────────── */

/*
 * Rules in lib/voice-conference.ts; plan in docs/plans/conference-calls-2026-10-28.md.
 * The first Add on a call promotes the bridged pair into a Telnyx conference
 * (startConference: created FROM the customer leg, the answerer's leg joined
 * — Call.conferenceId is the lock), and every added person is a
 * CallParticipant: a dialed number / client gets its own leg (client_state
 * leg "participant"), a teammate is rung the way an inbound call rings them
 * (browser SIP legs + the phone push; CallLeg.participantId marks the legs)
 * and whichever device answers becomes the participant's leg. Hold plays
 * the music to everyone but the person pressing it; the red button is Leave
 * once others are on; the answerer leaving hands the row to a joined
 * teammate (warm transfer); the customer hanging up ends it for everyone.
 */

const conferenceFirst = (call: Pick<Call, "via">): boolean => process.env.VOICE_CONFERENCE_FIRST === "1" && call.via === "app";

const MANAGER_ROLES = new Set(["OWNER", "ADMIN"]);

export type ParticipantView = {
  id: string;
  kind: string;
  label: string;
  status: string;
  userId: string | null;
  contactId: string | null;
  number: string | null;
  joinedAt: string | null;
  leftAt: string | null;
};

export type CallPeopleView = {
  conferenceId: string | null;
  participants: ParticipantView[];
  /** Which leg is the viewer's: the answerer's, a joined teammate's, or none. */
  me: "agent" | "participant" | null;
  canAdd: { ok: boolean; reason?: string };
  redButton: "leave" | "hangup";
};

const participantView = (p: ParticipantRow): ParticipantView => ({
  id: p.id,
  kind: p.kind,
  label: p.label,
  status: p.status,
  userId: p.userId,
  contactId: p.contactId,
  number: p.number,
  joinedAt: p.joinedAt?.toISOString() ?? null,
  leftAt: p.leftAt?.toISOString() ?? null,
});

/** The call screen's view of who is on a call (GET /api/app/line/softphone/call). */
export function callPeopleView(
  call: Pick<Call, "status" | "direction" | "via" | "userId" | "answeredByUserId" | "telnyxCallId" | "agentCallId" | "conferenceId"> & { participants: ParticipantRow[] },
  actorId: string
): CallPeopleView {
  const me = actorLeg(call, call.participants, actorId);
  const can = canAddParticipant(call, call.participants);
  return {
    conferenceId: isRealLegId(call.conferenceId) ? call.conferenceId : null,
    participants: call.participants.map(participantView),
    me: me?.kind ?? null,
    canAdd: can.ok ? { ok: true } : { ok: false, reason: can.reason },
    redButton: me && isRealLegId(call.conferenceId) && othersRemain(call, call.participants, me.telnyxCallId) ? "leave" : "hangup",
  };
}

/** Anyone on the call may add, mute or remove people; owners and admins may from the Calls page too. */
function requireOnCall(call: CallRow, actor: { id: string; role: string }): void {
  if (actorLeg(call, call.participants, actor.id) || MANAGER_ROLES.has(actor.role)) return;
  throw new VoiceError("Only someone on the call can do that.", 403);
}

/**
 * Create the conference from the customer leg and join the answerer's leg.
 * `Call.conferenceId` is claimed first (a "pending:" token), so two Adds at
 * once make one conference. False when the claim was taken or a leg is gone;
 * throws when Telnyx refuses (the claim is released).
 */
async function startConference(call: Pick<Call, "id" | "telnyxCallId" | "agentCallId">): Promise<boolean> {
  if (!isRealLegId(call.telnyxCallId) || !isRealLegId(call.agentCallId)) return false;
  const claimed = await prisma.call.updateMany({ where: { id: call.id, conferenceId: null }, data: { conferenceId: `pending:${call.id}` } });
  if (claimed.count === 0) return false;
  let conf: { id: string };
  try {
    conf = await createConference({
      callControlId: call.telnyxCallId,
      name: call.id,
      clientState: encodeState({ callId: call.id, leg: "customer", stage: "conference" }),
      commandId: `${call.id}:conference`,
    });
  } catch (err) {
    await prisma.call.updateMany({ where: { id: call.id, conferenceId: `pending:${call.id}` }, data: { conferenceId: null } }).catch(() => {});
    throw err;
  }
  await prisma.call.update({ where: { id: call.id }, data: { conferenceId: conf.id } });
  const ok = await conferenceAction(conf.id, "join", {
    call_control_id: call.agentCallId,
    start_conference_on_enter: true,
    client_state: encodeState({ callId: call.id, leg: "agent", stage: "conference" }),
    command_id: `${call.id}:conference:agent`,
  });
  console.info(`[voice] conference ${conf.id} for call=${call.id} (answerer joined=${ok})`);
  return ok;
}

/** The call's conference id, creating it from the bridged pair on the first Add. */
async function promoteToConference(call: CallRow): Promise<string> {
  const current = call.conferenceId ?? "";
  if (current && !current.startsWith("pending:")) return current;
  if (current.startsWith("pending:")) throw new VoiceError("Setting the call up — try again in a second.", 409);
  try {
    await startConference(call);
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    reportError(`[voice] promoting call ${call.id} to a conference failed:`, err);
    throw new VoiceError(`Telnyx couldn't open the call up for more people: ${detail}`, 424);
  }
  const fresh = await prisma.call.findUnique({ where: { id: call.id }, select: { conferenceId: true } });
  if (isRealLegId(fresh?.conferenceId)) return fresh.conferenceId;
  if (fresh?.conferenceId) throw new VoiceError("Setting the call up — try again in a second.", 409);
  throw new VoiceError("The call couldn't be opened up for more people.", 424);
}

export type AddTarget = { userId?: string | null; contactId?: string | null; to?: string | null };

/**
 * "Add" on the call screen (POST /api/app/line/call/participants): a
 * teammate (rung in the app), a client/lead (dialed from the line) or a
 * typed number. Returns the ringing participant; webhooks do the rest.
 */
export async function addParticipant(companyId: string, callId: string, actor: { id: string; role: string; name: string }, target: AddTarget): Promise<ParticipantView> {
  if (!voiceEnabled()) throw new VoiceError("Calling from the app isn't available on this server yet.", 503);
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call) throw new VoiceError("Call not found.", 404);
  requireOnCall(call, actor);
  const can = canAddParticipant(call, call.participants);
  if (!can.ok) throw new VoiceError(can.reason, 409);
  if (!isRealLegId(call.telnyxCallId) || !isRealLegId(call.agentCallId) || !call.company.lineNumber) throw new VoiceError("The call isn't connected.", 409);

  let kind: ParticipantKind;
  let userId: string | null = null;
  let contactId: string | null = null;
  let number: string | null = null;
  let label = "";
  const seated = (p: ParticipantRow) => p.status === "ringing" || p.status === "joined";
  if (target.userId) {
    const user = await prisma.user.findFirst({ where: { id: target.userId, companyId, isActive: true }, select: { id: true, name: true, role: true } });
    if (!user || !canUseSoftphone(user.role)) throw new VoiceError("Teammate not found.", 404);
    if (user.id === actor.id) throw new VoiceError("That's you — you're already on the call.");
    if (call.answeredByUserId === user.id || call.participants.some((p) => p.userId === user.id && seated(p))) {
      throw new VoiceError(`${user.name.split(" ")[0]} is already on the call.`, 409);
    }
    kind = "team";
    userId = user.id;
    label = user.name;
  } else if (target.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: target.contactId, companyId }, select: { id: true, phone: true, firstName: true, lastName: true } });
    if (!contact) throw new VoiceError("Client not found.", 404);
    number = toE164(contact.phone);
    if (!number) throw new VoiceError("This client has no dialable phone number.");
    kind = "contact";
    contactId = contact.id;
    label = `${contact.firstName} ${contact.lastName}`.trim() || fmtPhone(number);
  } else {
    number = toE164(target.to);
    if (!number) throw new VoiceError("Enter a valid phone number.");
    const digits = phoneDigits(number);
    const match = digits
      ? await prisma.contact.findFirst({ where: { companyId, phoneDigits: digits }, orderBy: { updatedAt: "desc" }, select: { id: true, firstName: true, lastName: true } })
      : null;
    kind = "number";
    contactId = match?.id ?? null;
    label = (match ? `${match.firstName} ${match.lastName}`.trim() : "") || fmtPhone(number);
  }
  if (number) {
    if (number === call.company.lineNumber) throw new VoiceError("That's your own business line.");
    if (number === call.customerNumber) throw new VoiceError("They're already on the call.");
    if (call.participants.some((p) => p.number === number && seated(p))) throw new VoiceError(`${label} is already on the call.`, 409);
  }

  await promoteToConference(call);
  const row = await prisma.callParticipant.create({
    data: { callId: call.id, kind, userId, contactId, number, label, addedByUserId: actor.id, status: "ringing" },
    select: participantSelect,
  });
  try {
    if (kind === "team") await ringTeamInvite(call, row, actor.name);
    else await dialParticipantNumber(call, row, number!);
  } catch (err) {
    await prisma.callParticipant.updateMany({ where: { id: row.id, status: "ringing" }, data: { status: "failed", leftAt: new Date(), hangupCause: "dial_failed" } }).catch(() => {});
    if (err instanceof VoiceError) throw err;
    reportError(`[voice] adding ${kind} to call ${call.id} failed:`, err);
    if (isInsufficientFunds(err)) {
      await alertTelnyxFunds(`adding a person to a call from ${call.company.lineNumber}`);
      throw new VoiceError(VOICE_PAUSED_MESSAGE, 424);
    }
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new VoiceError(`Telnyx couldn't ring them: ${detail}`, 424);
  }
  console.info(`[voice] call=${call.id}: ${actor.id} added ${kind} "${label}" (participant ${row.id})`);
  return participantView(row);
}

/** Ring a number from the line into the conference; the dial's leg is claimed on the row (or adopted by its first webhook). */
async function dialParticipantNumber(call: CallRow, row: ParticipantRow, number: string): Promise<void> {
  const leg = await dialCall({
    to: number,
    from: call.company.lineNumber!,
    clientState: encodeState({ callId: call.id, leg: "participant", stage: "ring", participantId: row.id }),
    timeoutSecs: PARTICIPANT_RING_SECS,
    linkTo: call.telnyxCallId!,
    commandId: `${call.id}:participant:${row.id}`,
  });
  await prisma.callParticipant.updateMany({
    where: { id: row.id, OR: [{ telnyxCallId: null }, { telnyxCallId: leg.call_control_id }] },
    data: { telnyxCallId: leg.call_control_id },
  });
}

/** Ring a teammate's browser (SIP leg) and phones (VoIP push) with the "wants to add you" card. */
async function ringTeamInvite(call: CallRow, row: ParticipantRow, byName: string): Promise<void> {
  const label = inviteLine(byName, displayParty(call));
  const [browser, phones] = await Promise.all([userSoftphoneOnline(row.userId!), voipTargetsFor(call.companyId)]);
  const mine = phones.filter((t) => t.userId === row.userId);
  let ringing = 0;
  if (browser) ringing = await ringSoftphones(call, [{ userId: row.userId!, sipUsername: browser.sipUsername, device: "browser" }], false, { participantId: row.id, label });
  const woken = mine.length ? await pushIncomingCall({ id: call.id, label, number: call.customerNumber, companyName: call.company.name }, mine) : 0;
  if (ringing === 0 && woken === 0) throw new VoiceError(`${row.label.split(" ")[0]} isn't on the app right now.`, 409);
  scheduleInviteExpiry(row.id, ((woken > 0 ? VOIP_WAKE_SECS : APP_RING_SECS) + 5) * 1000);
}

/** A pushed phone that never wakes rings nothing and sends no hangup: the invite is closed as no answer on a timer. */
function scheduleInviteExpiry(participantId: string, delayMs: number): void {
  setTimeout(() => {
    void (async () => {
      const row = await prisma.callParticipant.findUnique({ where: { id: participantId }, select: { id: true, callId: true, status: true } });
      if (!row || row.status !== "ringing") return;
      const open = await prisma.callLeg.count({ where: { callId: row.callId, participantId, endedAt: null } });
      if (open > 0) return;
      await prisma.callParticipant.updateMany({ where: { id: participantId, status: "ringing" }, data: { status: "no_answer", leftAt: new Date(), hangupCause: "timeout" } });
      console.info(`[voice] invite ${participantId} on call=${row.callId} rang out`);
    })().catch((err) => reportError("[voice] invite expiry failed:", err));
  }, delayMs);
}

/** The phone app woke for an invite onto a live call (wakeSoftphoneLeg): dial its SIP leg now. */
async function wakeTeamInvite(call: CallRow, invite: ParticipantRow, userId: string, device: PhoneDevice): Promise<WakeOutcome> {
  const col = phoneSipColumn(device);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ...PHONE_SIP_SELECT, softphoneEnabled: true, role: true, isActive: true } });
  if (!user?.[col] || !user.softphoneEnabled || !user.isActive || !canUseSoftphone(user.role)) return "ineligible";
  const open = await prisma.callLeg.count({ where: { callId: call.id, participantId: invite.id, userId, device, endedAt: null } });
  if (open > 0) return "already";
  const [creds, by] = await Promise.all([phoneCredentialsOfLogin(userId, device), prisma.user.findUnique({ where: { id: invite.addedByUserId }, select: { name: true } })]);
  const rang = await ringSoftphones(
    call,
    creds.map((sipUsername) => ({ userId, sipUsername, device })),
    true,
    { participantId: invite.id, label: inviteLine(by?.name ?? "", displayParty(call)) }
  );
  console.info(`[voice] invite ${invite.id} call=${call.id}: ${rang}/${creds.length} SIP leg(s) to the ${device} phone`);
  return rang > 0 ? "ringing" : "late";
}

/** Put an answered leg into the conference; a refused join drops the leg and marks the row failed. */
async function joinConference(call: CallRow, participantId: string, ccid: string, leg: "participant" | "app"): Promise<void> {
  let ok = false;
  try {
    ok = await conferenceAction(call.conferenceId!, "join", {
      call_control_id: ccid,
      start_conference_on_enter: true,
      client_state: encodeState({ callId: call.id, leg, stage: "conference", participantId }),
      command_id: `${call.id}:join:${participantId}:${ccid}`,
    });
  } catch (err) {
    reportError(`[voice] conference join failed for participant ${participantId}:`, err);
  }
  if (ok) {
    console.info(`[voice] participant ${participantId} joined call=${call.id}`);
    return;
  }
  await callAction(ccid, "hangup").catch(() => {});
  await prisma.callParticipant.updateMany({ where: { id: participantId, status: "joined" }, data: { status: "failed", leftAt: new Date(), hangupCause: "join_failed" } });
}

/** A dialed number picked up. */
async function onParticipantAnswered(call: CallRow, participantId: string, ccid: string): Promise<void> {
  if (call.status !== "IN_PROGRESS" || !isRealLegId(call.conferenceId)) {
    await callAction(ccid, "hangup").catch(() => {});
    await prisma.callParticipant.updateMany({ where: { id: participantId, status: "ringing" }, data: { status: "failed", leftAt: new Date(), hangupCause: "call_over" } });
    return;
  }
  const claimed = await prisma.callParticipant.updateMany({ where: { id: participantId, status: "ringing" }, data: { status: "joined", joinedAt: new Date(), telnyxCallId: ccid } });
  if (claimed.count === 0) return; // retried webhook
  await joinConference(call, participantId, ccid, "participant");
}

/** A rung teammate answered on one of their devices: that leg is theirs, the others are dropped. */
async function onTeamLegAnswered(call: CallRow, participantId: string, ccid: string): Promise<void> {
  if (call.status !== "IN_PROGRESS" || !isRealLegId(call.conferenceId)) {
    await callAction(ccid, "hangup").catch(() => {});
    return;
  }
  const claimed = await prisma.callParticipant.updateMany({ where: { id: participantId, status: "ringing" }, data: { status: "joined", joinedAt: new Date(), telnyxCallId: ccid } });
  if (claimed.count === 0) {
    // Another of their devices won, or the invite was cancelled / rang out.
    await callAction(ccid, "hangup").catch(() => {});
    return;
  }
  const others = await prisma.callLeg.findMany({ where: { callId: call.id, participantId, endedAt: null, telnyxCallId: { not: ccid } }, select: { telnyxCallId: true } });
  for (const l of others) await callAction(l.telnyxCallId, "hangup").catch(() => {});
  await joinConference(call, participantId, ccid, "app");
}

/** A dialed participant's leg ended: no answer, or they left the call. */
async function onParticipantLegEnded(call: CallRow, participant: ParticipantRow, cause: string | null, now: Date): Promise<void> {
  const status = participantStatusAfterHangup(participant.status, cause);
  await prisma.callParticipant.updateMany({ where: { id: participant.id, status: { in: ["ringing", "joined"] } }, data: { status, leftAt: now, hangupCause: cause } });
  console.info(`[voice] participant ${participant.id} (${participant.kind}) ended call=${call.id} cause=${cause ?? "-"} → ${status}`);
  if (participant.status === "joined") await afterParticipantLeft(call.id);
}

/** One of a rung teammate's legs ended: they left (it was their joined leg), or that device stopped ringing. */
async function onTeamLegEnded(call: CallRow, appLeg: AppLeg, cause: string | null, now: Date): Promise<void> {
  const row = call.participants.find((p) => p.id === appLeg.participantId);
  if (!row) return;
  if (row.status === "joined" && row.telnyxCallId === appLeg.telnyxCallId) {
    await prisma.callParticipant.updateMany({ where: { id: row.id, status: "joined" }, data: { status: "left", leftAt: now, hangupCause: cause } });
    await afterParticipantLeft(call.id);
    return;
  }
  if (row.status !== "ringing") return;
  const open = await prisma.callLeg.count({ where: { callId: call.id, participantId: row.id, endedAt: null } });
  if (open > 0) return;
  // Rang out or declined → no answer. A leg that died within seconds (a
  // phone's registration had gone stale, SIP 480) is not an answer: the
  // phone re-registers and asks again, and the invite timer closes it otherwise.
  const leg = await prisma.callLeg.findUnique({ where: { id: appLeg.id }, select: { createdAt: true } });
  const ageMs = leg ? now.getTime() - leg.createdAt.getTime() : Infinity;
  if (cause !== "timeout" && ageMs < 3000) return;
  await prisma.callParticipant.updateMany({ where: { id: row.id, status: "ringing" }, data: { status: "no_answer", leftAt: now, hangupCause: cause ?? "timeout" } });
}

/** Someone left the mix: when only the customer is left (the answerer gone too), end the call. */
async function afterParticipantLeft(callId: string): Promise<void> {
  const fresh = await prisma.call.findUnique({ where: { id: callId }, include: callInclude });
  if (!fresh || fresh.status !== "IN_PROGRESS") return;
  if (othersRemain(fresh, fresh.participants, null)) return;
  console.info(`[voice] call=${callId}: everyone but the customer left — ending it`);
  if (isRealLegId(fresh.telnyxCallId)) await callAction(fresh.telnyxCallId, "hangup").catch(() => {});
}

/** The answerer left a conference that goes on: a joined teammate takes the row over (warm transfer). */
async function onAnswererLeft(call: CallRow, leavingLeg: string): Promise<void> {
  const next = handOffAfterLeave(call.participants, leavingLeg);
  const r = await prisma.call.updateMany({
    where: { id: call.id, agentCallId: leavingLeg },
    data: { agentCallId: null, ...(next ? { answeredByUserId: next, via: "app" } : {}) },
  });
  if (r.count > 0) console.info(`[voice] call=${call.id}: the answerer left; ${next ? `handed to user ${next}` : "the others stay on"}`);
}

/** Leave (POST /api/app/line/call/leave): only the actor's leg drops; the call goes on for the others. */
export async function leaveCall(companyId: string, callId: string, actorId: string): Promise<{ status: CallStatus }> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call) throw new VoiceError("Call not found.", 404);
  if (call.status !== "IN_PROGRESS") return { status: call.status };
  const me = actorLeg(call, call.participants, actorId);
  if (!me) throw new VoiceError("You're not on this call.", 409);
  if (!isRealLegId(call.conferenceId) || !othersRemain(call, call.participants, me.telnyxCallId)) return cancelCall(companyId, callId, { everyone: true });
  if (me.kind === "agent") await onAnswererLeft(call, me.telnyxCallId);
  else await prisma.callParticipant.updateMany({ where: { id: me.participantId, status: "joined" }, data: { status: "left", leftAt: new Date(), hangupCause: "left" } });
  if (voiceEnabled()) await callAction(me.telnyxCallId, "hangup").catch((e) => reportError("[voice] leave hangup failed:", e));
  await afterParticipantLeft(call.id);
  return { status: call.status };
}

/** The ✕ on a participant chip: hang their leg up (or stop ringing them). */
export async function removeParticipant(companyId: string, callId: string, actor: { id: string; role: string }, participantId: string): Promise<ParticipantView> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call) throw new VoiceError("Call not found.", 404);
  requireOnCall(call, actor);
  const row = call.participants.find((p) => p.id === participantId);
  if (!row) throw new VoiceError("They're not on this call.", 404);
  if (row.status === "ringing" || row.status === "joined") {
    const now = new Date();
    await prisma.callParticipant.updateMany({
      where: { id: row.id, status: { in: ["ringing", "joined"] } },
      data: { status: row.status === "joined" ? "left" : "no_answer", leftAt: now, hangupCause: "removed" },
    });
    if (voiceEnabled()) {
      if (isRealLegId(row.telnyxCallId)) await callAction(row.telnyxCallId, "hangup").catch((e) => reportError("[voice] remove hangup failed:", e));
      const legs = await prisma.callLeg.findMany({ where: { callId: call.id, participantId: row.id, endedAt: null }, select: { telnyxCallId: true } });
      for (const l of legs) await callAction(l.telnyxCallId, "hangup").catch(() => {});
    }
    await prisma.callLeg.updateMany({ where: { callId: call.id, participantId: row.id, endedAt: null }, data: { endedAt: now, hangupCause: "removed" } });
    if (row.status === "joined") await afterParticipantLeft(call.id);
  }
  const fresh = await prisma.callParticipant.findUnique({ where: { id: row.id }, select: participantSelect });
  return participantView(fresh ?? row);
}

/** Mute / unmute one participant in the mix (the chip's toggle). */
export async function muteParticipant(companyId: string, callId: string, actor: { id: string; role: string }, participantId: string, mute: boolean): Promise<{ muted: boolean }> {
  const call = await prisma.call.findFirst({ where: { id: callId, companyId }, include: callInclude });
  if (!call) throw new VoiceError("Call not found.", 404);
  requireOnCall(call, actor);
  const row = call.participants.find((p) => p.id === participantId);
  if (!row || row.status !== "joined" || !isRealLegId(row.telnyxCallId) || !isRealLegId(call.conferenceId)) throw new VoiceError("They're not on the call.", 409);
  try {
    await conferenceAction(call.conferenceId, mute ? "mute" : "unmute", { call_control_ids: [row.telnyxCallId] });
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    throw new VoiceError(`Telnyx couldn't ${mute ? "mute" : "unmute"} them: ${detail}`, 424);
  }
  return { muted: mute };
}

/** Who could be added right now: active teammates who take calls, with whether the app can reach them. */
export async function addablePeople(companyId: string, callId: string, actorId: string): Promise<{ team: Array<{ id: string; name: string; online: "app" | "phone" | null }> }> {
  const [call, users, phones] = await Promise.all([
    prisma.call.findFirst({ where: { id: callId, companyId }, select: { answeredByUserId: true, participants: { select: { userId: true, status: true } } } }),
    prisma.user.findMany({
      where: { companyId, isActive: true, id: { not: actorId } },
      select: { id: true, name: true, role: true, softphoneEnabled: true, softphoneSeenAt: true, sipUsername: true },
      orderBy: { name: "asc" },
    }),
    voipTargetsFor(companyId).catch(() => []),
  ]);
  const onCall = new Set<string>();
  if (call?.answeredByUserId) onCall.add(call.answeredByUserId);
  for (const p of call?.participants ?? []) if (p.userId && (p.status === "ringing" || p.status === "joined")) onCall.add(p.userId);
  const withPhone = new Set(phones.map((t) => t.userId));
  const now = new Date();
  const team = users
    .filter((u) => canUseSoftphone(u.role) && !onCall.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.name,
      online: (u.softphoneEnabled && u.sipUsername && isSoftphoneOnline(u.softphoneSeenAt, now) ? "app" : u.softphoneEnabled && withPhone.has(u.id) ? "phone" : null) as "app" | "phone" | null,
    }))
    .sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online)) || a.name.localeCompare(b.name));
  return { team };
}

/** conference.participant.joined — Telnyx confirms the mix; the row was marked at the answer, so this is the audit line. */
async function onConferenceJoined(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  console.info(`[voice] conference ${p.conference_id ?? "?"} joined by ${hit ? `${hit.leg}${hit.participant ? ` ${hit.participant.id}` : ""} call=${hit.call.id}` : `unknown leg ${p.call_control_id}`}`);
}

/** conference.participant.left — the leg's own hangup usually got here first; this closes the row if that webhook was lost. */
async function onConferenceLeft(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id, p.client_state);
  console.info(`[voice] conference ${p.conference_id ?? "?"} left by ${hit ? `${hit.leg}${hit.participant ? ` ${hit.participant.id}` : ""} call=${hit.call.id}` : `unknown leg ${p.call_control_id}`}`);
  if (!hit?.participant || hit.participant.status !== "joined" || hit.participant.telnyxCallId !== p.call_control_id) return;
  await prisma.callParticipant.updateMany({ where: { id: hit.participant.id, status: "joined" }, data: { status: "left", leftAt: new Date(), hangupCause: "conference_left" } });
  await afterParticipantLeft(hit.call.id);
}

/** The customer hung up on a conference: drop the answerer and every participant still on it. */
async function endConferenceLegs(call: CallRow, now: Date, cause: string | null): Promise<void> {
  if (isRealLegId(call.agentCallId)) await callAction(call.agentCallId, "hangup").catch((e) => reportError("[voice] conference answerer hangup failed:", e));
  await hangupParticipantLegs(call, now, cause).catch((e) => reportError("[voice] conference participant hangup failed:", e));
}

/** Hang up every participant leg still open (dialed numbers and ringing teammates) and close their rows. */
async function hangupParticipantLegs(call: CallRow, now: Date, cause: string | null): Promise<void> {
  for (const p of call.participants) {
    if ((p.status === "ringing" || p.status === "joined") && isRealLegId(p.telnyxCallId)) await callAction(p.telnyxCallId, "hangup").catch(() => {});
  }
  await hangupAppLegs(call.id, null).catch(() => {});
  await closeParticipantRows(call.id, now, cause);
}

/** Ringing → no answer, joined → left, for every open row on a call that is over. */
async function closeParticipantRows(callId: string, now: Date, cause: string | null): Promise<void> {
  await prisma.callParticipant.updateMany({ where: { callId, status: "ringing" }, data: { status: "no_answer", leftAt: now, hangupCause: cause } });
  await prisma.callParticipant.updateMany({ where: { callId, status: "joined" }, data: { status: "left", leftAt: now, hangupCause: cause } });
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
      await closeParticipantRows(call.id, now, "stale");
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
