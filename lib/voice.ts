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

import type { Call, CallStatus, Contact } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasAddon } from "@/lib/addon";
import { defaultVoicemailGreeting, isRealLineNumber } from "@/lib/business-line-shared";
import { fmtPhone } from "@/lib/format";
import { phoneDigits } from "@/lib/phone";
import { notifyUsers } from "@/lib/push";
import { toE164 } from "@/lib/sms";
import {
  TTS,
  TelnyxError,
  callAction,
  dialCall,
  getRecording,
  listRecordingsForLeg,
  setCallForwarding,
  setNumberConnection,
  voiceAppId,
  voiceConfigured,
} from "@/lib/telnyx";

export class VoiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "VoiceError";
    this.status = status;
  }
}

export function voiceEnabled(): boolean {
  return voiceConfigured();
}

const baseUrl = () => (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
const ringbackUrl = () => `${baseUrl()}/ringback.wav`;

/** How long the owner's cell rings before it counts as no answer. Short: their carrier voicemail would answer at ~25 s anyway. */
export const AGENT_RING_SECS = 25;
/** How long a customer's phone rings on an outbound call. */
export const CUSTOMER_RING_SECS = 30;
export const VOICEMAIL_MAX_SECS = 180;
/** A voicemail shorter than this is a hang-up, not a message. */
export const VOICEMAIL_MIN_SECS = 2;
/** RINGING rows older than this never got their hangup webhook — close them. */
export const STALE_RINGING_MS = 5 * 60_000;
/** VOICEMAIL rows with no recording this long after the hangup left nothing. */
export const STALE_VOICEMAIL_MS = 10 * 60_000;

/* ───────────────────────── Pure helpers ───────────────────────── */

export type Leg = "customer" | "agent";
export type Stage = "ring" | "whisper" | "bridged" | "vm_greeting" | "vm_record" | "out_whisper" | "out_no_answer";
export type ClientState = { callId: string; leg: Leg; stage?: Stage };

export function encodeState(s: ClientState): string {
  return Buffer.from(JSON.stringify(s)).toString("base64");
}

export function decodeState(raw: string | null | undefined): ClientState | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Partial<ClientState>;
    if (typeof j.callId !== "string" || (j.leg !== "customer" && j.leg !== "agent")) return null;
    return { callId: j.callId, leg: j.leg, stage: j.stage };
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

export type StaleAction = "close" | "empty_voicemail" | null;

/** What the sweep should do with a row that stopped getting webhooks. */
export function staleCallPlan(
  call: Pick<Call, "status" | "createdAt" | "endedAt" | "voicemailRecordingId">,
  now: Date
): StaleAction {
  if (call.status === "RINGING" || call.status === "IN_PROGRESS") {
    return now.getTime() - call.createdAt.getTime() > STALE_RINGING_MS ? "close" : null;
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
    const detail = err instanceof TelnyxError ? err.detail : err instanceof Error ? err.message : "unknown error";
    throw new VoiceError(`Telnyx couldn't move the number onto the voice app: ${detail}`, 502);
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

async function findCallByLeg(ccid: string | undefined): Promise<{ call: CallRow; leg: Leg } | null> {
  if (!ccid) return null;
  const call = await prisma.call.findFirst({
    where: { OR: [{ telnyxCallId: ccid }, { agentCallId: ccid }] },
    include: { company: { select: companySelect }, contact: { select: { firstName: true, lastName: true } } },
  });
  if (!call) return null;
  return { call, leg: call.telnyxCallId === ccid ? "customer" : "agent" };
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
  const hit = await findCallByLeg(p.call_control_id);
  if (!hit) return;
  const { call, leg } = hit;
  if (call.status !== "RINGING") return;

  if (call.direction === "INBOUND" && leg === "customer") {
    const forwardTo = call.company.lineForwardTo;
    if (!forwardTo || !call.company.lineNumber) return toVoicemail(call);
    // Guard the dial: a retried webhook must not ring the cell twice.
    const claimed = await prisma.call.updateMany({ where: { id: call.id, agentCallId: null }, data: { agentCallId: `pending:${call.id}` } });
    if (claimed.count === 0) return;
    await callAction(call.telnyxCallId!, "playback_start", { audio_url: ringbackUrl(), loop: "infinity" });
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

/** Join the cell leg to the customer leg; the row flips to IN_PROGRESS only if Telnyx accepted the bridge. */
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
    return;
  }
  // Nobody stays stranded on ringback: the cell leg is dropped and an inbound
  // caller gets voicemail; an outbound customer leg is hung up.
  await callAction(call.agentCallId, "hangup");
  if (call.direction === "INBOUND") await toVoicemail(call);
  else await callAction(call.telnyxCallId, "hangup");
}

async function onGatherEnded(p: VoiceEventPayload): Promise<void> {
  const hit = await findCallByLeg(p.call_control_id);
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
  const hit = await findCallByLeg(p.call_control_id);
  if (!hit) return;
  const { call, leg } = hit;
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
    if (call.direction === "INBOUND") {
      // Caller gone while the cell was still ringing / in the whisper.
      if (call.status === "RINGING" && call.agentCallId && !call.agentCallId.startsWith("pending:")) {
        await callAction(call.agentCallId, "hangup");
      }
      if (status === "MISSED" && call.status !== "MISSED") await notifyMissed(call);
    } else if (call.status === "RINGING" && call.agentCallId) {
      // Customer never picked up: tell the owner, then drop their leg.
      await callAction(call.agentCallId, "playback_stop");
      await callAction(call.agentCallId, "speak", {
        payload: status === "NO_ANSWER" ? "No answer." : "The call could not be connected.",
        ...TTS,
        client_state: encodeState({ callId: call.id, leg: "agent", stage: "out_no_answer" }),
      });
    }
    return;
  }

  // Agent (cell) leg
  if (call.status !== "RINGING") return; // bridged: the customer leg's hangup closes the row
  if (call.direction === "INBOUND") return toVoicemail(call);
  await prisma.call.update({
    where: { id: call.id },
    data: { status: "FAILED", hangupCause: cause ?? "agent_hangup", endedAt: now },
  });
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
  const hit = await findCallByLeg(p.call_control_id);
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
  target: { contactId?: string | null; to?: string | null }
): Promise<{ callId: string; agentNumber: string; customerNumber: string }> {
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
  if (!isRealLineNumber(company.lineNumber)) throw new VoiceError("Get a business line first (Settings → Features).", 409);
  if (!company.lineVoiceAppAt && !(await ensureVoiceRouting(companyId))) {
    throw new VoiceError("Your line isn't on the voice app yet — try again in a minute.", 503);
  }
  const agentNumber = toE164(user?.phone) ?? company.lineForwardTo;
  if (!agentNumber) throw new VoiceError("Add your cell number under Settings → My Profile so we can ring you first.", 409);

  let customerNumber: string | null = null;
  let contactId: string | null = null;
  if (target.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: target.contactId, companyId },
      select: { id: true, phone: true },
    });
    if (!contact) throw new VoiceError("Client not found.", 404);
    customerNumber = toE164(contact.phone);
    contactId = contact.id;
    if (!customerNumber) throw new VoiceError("This client has no dialable phone number.");
  } else {
    customerNumber = toE164(target.to);
    if (!customerNumber) throw new VoiceError("Enter a valid phone number to call.");
    const digits = phoneDigits(customerNumber);
    const match = digits
      ? await prisma.contact.findFirst({ where: { companyId, phoneDigits: digits }, orderBy: { updatedAt: "desc" }, select: { id: true } })
      : null;
    contactId = match?.id ?? null;
  }
  if (customerNumber === company.lineNumber) throw new VoiceError("That's your own business line.");
  if (customerNumber === agentNumber) throw new VoiceError("That's the phone we'd be ringing you on.");

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
    },
    select: { id: true },
  });
  try {
    const leg = await dialCall({
      to: agentNumber,
      from: company.lineNumber,
      clientState: encodeState({ callId: call.id, leg: "agent", stage: "ring" }),
      timeoutSecs: AGENT_RING_SECS,
      commandId: `${call.id}:agent`,
    });
    await prisma.call.update({ where: { id: call.id }, data: { agentCallId: leg.call_control_id } });
  } catch (err) {
    const detail = err instanceof TelnyxError ? err.detail : "unknown error";
    await prisma.call.update({ where: { id: call.id }, data: { status: "FAILED", hangupCause: "dial_failed", endedAt: new Date() } });
    throw new VoiceError(`Telnyx couldn't place the call: ${detail}`, 502);
  }
  return { callId: call.id, agentNumber, customerNumber };
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
        { status: { in: ["RINGING", "IN_PROGRESS"] }, createdAt: { lt: new Date(now.getTime() - STALE_RINGING_MS) } },
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
      for (const ccid of [call.telnyxCallId, call.agentCallId]) {
        if (ccid && !ccid.startsWith("pending:") && voiceEnabled()) await callAction(ccid, "hangup").catch(() => {});
      }
      out.closed++;
    } else {
      await prisma.call.update({ where: { id: call.id }, data: { status: "MISSED" } });
      out.emptied++;
    }
  }
  return out;
}

/** The Calls page was opened: everything finished is now seen. */
export async function markCallsSeen(companyId: string): Promise<void> {
  await prisma.call.updateMany({
    where: { companyId, seenAt: null, status: { in: ["COMPLETED", "MISSED", "VOICEMAIL", "NO_ANSWER", "FAILED"] } },
    data: { seenAt: new Date() },
  });
}
