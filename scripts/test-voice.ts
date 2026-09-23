/**
 * Unit tests for the pure parts of lib/voice.ts: client-state codec, the
 * whisper/greeting copy, status-after-hangup, the stale-call sweep plan —
 * and lib/softphone.ts: presence + the inbound ring plan (tier 2).
 *   npx tsx scripts/test-voice.ts
 * Needs a placeholder DATABASE_URL (the module imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import {
  AGENT_RING_SECS,
  STALE_RINGING_MS,
  STALE_VOICEMAIL_MS,
  VoiceError,
  decodeState,
  encodeState,
  fmtDuration,
  greetingFor,
  isTerminalStatus,
  outboundWhisperText,
  partyLabel,
  pipelineTriggerForCall,
  sanitizeGreeting,
  sipDisplayName,
  spokenNumber,
  staleCallPlan,
  statusAfterCustomerHangup,
  talkSeconds,
  unansweredOutboundStatus,
  whisperText,
} from "../lib/voice";
import { defaultCallerIdName, defaultVoicemailGreeting, isRealLineNumber } from "../lib/business-line-shared";
import { APP_RING_SECS, MAX_APP_LEGS, SOFTPHONE_PRESENCE_MS, canUseSoftphone, isSoftphoneOnline, ringPlan } from "../lib/softphone";
import { sipUri } from "../lib/telnyx";

// ── client state ─────────────────────────────────────────────────────────────
{
  const s = { callId: "c1", leg: "agent" as const, stage: "whisper" as const };
  const enc = encodeState(s);
  assert.match(enc, /^[A-Za-z0-9+/=]+$/); // Telnyx wants plain base64
  assert.deepEqual(decodeState(enc), s);
  assert.equal(decodeState(null), null);
  assert.equal(decodeState("not base64 json"), null);
  assert.equal(decodeState(Buffer.from(JSON.stringify({ callId: "x", leg: "nope" })).toString("base64")), null);
  // Softphone legs carry the user they were dialed for; the cell leg carries nothing extra.
  const app = { callId: "c1", leg: "app" as const, stage: "ring" as const, userId: "u1" };
  assert.deepEqual(decodeState(encodeState(app)), app);
  assert.equal("userId" in (decodeState(encodeState(s)) ?? {}), false);
}

// ── copy ─────────────────────────────────────────────────────────────────────
assert.equal(spokenNumber("+12145550100"), "2 1 4, 5 5 5, 0 1 0 0");
assert.equal(spokenNumber("+18334950229"), "8 3 3, 4 9 5, 0 2 2 9");
assert.equal(spokenNumber("anonymous"), "an unknown number");
assert.equal(partyLabel({ firstName: "Maria", lastName: "Lopez" }, "+12145550100"), "Maria Lopez");
assert.equal(partyLabel({ firstName: "", lastName: "" }, "+12145550100"), "2 1 4, 5 5 5, 0 1 0 0");
assert.equal(partyLabel(null, "+12145550100"), "2 1 4, 5 5 5, 0 1 0 0");
assert.equal(
  whisperText("Streamflaire", "Maria Lopez"),
  "Streamflaire call from Maria Lopez. Press 1 to accept, or hang up to send it to voicemail."
);
assert.equal(outboundWhisperText("Streamflaire", "Maria Lopez"), "Press 1 to call Maria Lopez from your Streamflaire line.");
assert.equal(greetingFor("Streamflaire", null), defaultVoicemailGreeting("Streamflaire"));
assert.equal(greetingFor("Streamflaire", "   "), defaultVoicemailGreeting("Streamflaire"));
assert.equal(greetingFor("Streamflaire", "Leave it after the beep."), "Leave it after the beep.");
assert.match(defaultVoicemailGreeting("Acme Plumbing"), /reached Acme Plumbing/);

// ── SIP display name (Telnyx from_display_name charset) ──────────────────────
const SIP_NAME_OK = /^[A-Za-z0-9 \-_~!.+]{1,128}$/;
for (const s of ["(469) 833-5853", "+14698335853", "4698335853", "Maria O'Brien", "José Núñez & Sons, LLC", "Unknown caller · (214) 555-0100", "x".repeat(200)]) {
  const out = sipDisplayName(s);
  assert.ok(out && SIP_NAME_OK.test(out), `${JSON.stringify(s)} → ${JSON.stringify(out)} must satisfy the Telnyx charset`);
}
assert.equal(sipDisplayName("(469) 833-5853"), "469-833-5853");
assert.equal(sipDisplayName("+14698335853"), "469-833-5853");
assert.equal(sipDisplayName("Maria O'Brien"), "Maria OBrien");
assert.equal(sipDisplayName("Maria Lopez"), "Maria Lopez");
assert.equal(sipDisplayName(""), undefined);
assert.equal(sipDisplayName("((("), undefined);
assert.equal(sipDisplayName(null), undefined);
assert.equal(sipDisplayName("x".repeat(200))!.length, 128);

// ── greeting sanitizer ───────────────────────────────────────────────────────
assert.equal(sanitizeGreeting(""), null);
assert.equal(sanitizeGreeting(undefined), null);
assert.equal(sanitizeGreeting("  Hi   there \n ok "), "Hi there ok");
assert.throws(() => sanitizeGreeting("x".repeat(601)), VoiceError);

// ── status after the customer leg hangs up ───────────────────────────────────
const inbound = (status: Parameters<typeof statusAfterCustomerHangup>[0]["status"]) => ({ status, direction: "INBOUND" as const });
const outbound = (status: Parameters<typeof statusAfterCustomerHangup>[0]["status"]) => ({ status, direction: "OUTBOUND" as const });
assert.equal(statusAfterCustomerHangup(inbound("IN_PROGRESS"), "normal_clearing"), "COMPLETED");
assert.equal(statusAfterCustomerHangup(inbound("RINGING"), "originator_cancel"), "MISSED");
assert.equal(statusAfterCustomerHangup(inbound("VOICEMAIL"), "normal_clearing"), "VOICEMAIL");
assert.equal(statusAfterCustomerHangup(inbound("MISSED"), "normal_clearing"), "MISSED"); // terminal stays
assert.equal(statusAfterCustomerHangup(outbound("IN_PROGRESS"), "normal_clearing"), "COMPLETED");
assert.equal(statusAfterCustomerHangup(outbound("RINGING"), "timeout"), "NO_ANSWER");
assert.equal(statusAfterCustomerHangup(outbound("RINGING"), "user_busy"), "NO_ANSWER");
assert.equal(statusAfterCustomerHangup(outbound("RINGING"), "call_rejected"), "NO_ANSWER");
assert.equal(statusAfterCustomerHangup(outbound("RINGING"), "unspecified"), "FAILED");
assert.equal(statusAfterCustomerHangup(outbound("RINGING"), null), "NO_ANSWER");
assert.equal(isTerminalStatus("COMPLETED"), true);
assert.equal(isTerminalStatus("RINGING"), false);

// ── Leads-board trigger for a call ───────────────────────────────────────────
assert.equal(pipelineTriggerForCall(outbound("IN_PROGRESS")), "CONTACT_MADE"); // fires at bridge
assert.equal(pipelineTriggerForCall(outbound("COMPLETED")), "CONTACT_MADE");
assert.equal(pipelineTriggerForCall(inbound("COMPLETED")), "CONTACT_MADE"); // they called, you talked
assert.equal(pipelineTriggerForCall(outbound("NO_ANSWER")), "CALL_NO_ANSWER");
assert.equal(pipelineTriggerForCall(inbound("MISSED")), null); // they tried to reach you
assert.equal(pipelineTriggerForCall(inbound("VOICEMAIL")), null);
assert.equal(pipelineTriggerForCall(outbound("FAILED")), null); // the dial broke, not the lead
assert.equal(pipelineTriggerForCall(outbound("RINGING")), null);

// ── our side hangs up on a ringing customer ──────────────────────────────────
assert.equal(unansweredOutboundStatus({ telnyxCallId: "v3:abc" }), "NO_ANSWER"); // it rang; they didn't pick up
assert.equal(unansweredOutboundStatus({ telnyxCallId: "pending:xyz" }), "FAILED"); // whisper declined, never dialed
assert.equal(unansweredOutboundStatus({ telnyxCallId: null }), "FAILED");

// ── stale sweep plan ─────────────────────────────────────────────────────────
const now = new Date("2026-09-18T20:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
assert.equal(staleCallPlan({ status: "RINGING", createdAt: ago(60_000), endedAt: null, voicemailRecordingId: null }, now), null);
assert.equal(staleCallPlan({ status: "RINGING", createdAt: ago(STALE_RINGING_MS + 1), endedAt: null, voicemailRecordingId: null }, now), "close");
assert.equal(staleCallPlan({ status: "IN_PROGRESS", createdAt: ago(STALE_RINGING_MS + 1), endedAt: null, voicemailRecordingId: null }, now), "close");
assert.equal(staleCallPlan({ status: "VOICEMAIL", createdAt: ago(3_600_000), endedAt: ago(60_000), voicemailRecordingId: null }, now), null);
assert.equal(
  staleCallPlan({ status: "VOICEMAIL", createdAt: ago(3_600_000), endedAt: ago(STALE_VOICEMAIL_MS + 1), voicemailRecordingId: null }, now),
  "empty_voicemail"
);
assert.equal(staleCallPlan({ status: "VOICEMAIL", createdAt: ago(3_600_000), endedAt: ago(3_600_000), voicemailRecordingId: "rec" }, now), null);
assert.equal(staleCallPlan({ status: "COMPLETED", createdAt: ago(3_600_000), endedAt: ago(3_600_000), voicemailRecordingId: null }, now), null);

// ── caller ID name (CNAM: ≤15 uppercase alphanumerics/spaces) ────────────────
assert.equal(defaultCallerIdName("Streamflaire"), "STREAMFLAIRE");
assert.equal(defaultCallerIdName("Streamflaire Group, LLC"), "STREAMFLAIRE GR");
assert.equal(defaultCallerIdName("Bob's  Plumbing & Heating"), "BOBS PLUMBING A");
assert.equal(defaultCallerIdName("  A-1  Roofing  "), "A1 ROOFING");
assert.equal(defaultCallerIdName("!!!"), "");
assert.ok(defaultCallerIdName("x".repeat(40)).length <= 15);

// ── softphone: presence + ring plan ──────────────────────────────────────────
{
  assert.equal(isSoftphoneOnline(null, now), false);
  assert.equal(isSoftphoneOnline(ago(1_000), now), true);
  assert.equal(isSoftphoneOnline(ago(SOFTPHONE_PRESENCE_MS), now), true);
  assert.equal(isSoftphoneOnline(ago(SOFTPHONE_PRESENCE_MS + 1), now), false);
  assert.ok(SOFTPHONE_PRESENCE_MS > 60_000, "a hidden tab only heartbeats once a minute");
  assert.ok(APP_RING_SECS < AGENT_RING_SECS, "browsers ring briefly; the cell is the fallback, not the other way round");

  const u = (n: number) => ({ userId: `u${n}`, sipUsername: `sip${n}` });
  // Nobody online → the cell rings right away; no cell either → voicemail.
  assert.deepEqual(ringPlan([], "+14695550100"), { app: [], cell: "+14695550100", first: "cell" });
  assert.deepEqual(ringPlan([], null), { app: [], cell: null, first: "voicemail" });
  assert.deepEqual(ringPlan([], ""), { app: [], cell: null, first: "voicemail" });
  // Browsers online → they ring first, the cell stays queued behind them.
  const p = ringPlan([u(1), u(2)], "+14695550100");
  assert.equal(p.first, "app");
  assert.deepEqual(p.app, [u(1), u(2)]);
  assert.equal(p.cell, "+14695550100");
  // Browsers online, no cell → still the browsers; voicemail only after they give up.
  assert.equal(ringPlan([u(1)], null).first, "app");
  // Fan-out is capped.
  const many = Array.from({ length: MAX_APP_LEGS + 3 }, (_, i) => u(i));
  assert.equal(ringPlan(many, null).app.length, MAX_APP_LEGS);

  assert.equal(sipUri("gencredabc"), "sip:gencredabc@sip.telnyx.com");
  assert.equal(canUseSoftphone("OWNER"), true);
  assert.equal(canUseSoftphone("SALES"), true);
  assert.equal(canUseSoftphone("TECH"), false);
}

// ── small helpers ────────────────────────────────────────────────────────────
assert.equal(talkSeconds(null, now), null);
assert.equal(talkSeconds(ago(65_400), now), 65);
assert.equal(fmtDuration(65), "1:05");
assert.equal(fmtDuration(0), "0:00");
assert.ok(AGENT_RING_SECS < 30, "the cell must stop ringing before its carrier voicemail would answer");
assert.equal(isRealLineNumber("pending:abc"), false);
assert.equal(isRealLineNumber("+18334950229"), true);

console.log("test-voice: all assertions passed");
