/**
 * Unit tests for the pure parts of lib/voice.ts: client-state codec, the
 * whisper/greeting copy, status-after-hangup, the stale-call sweep plan.
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
  sanitizeGreeting,
  spokenNumber,
  staleCallPlan,
  statusAfterCustomerHangup,
  talkSeconds,
  whisperText,
} from "../lib/voice";
import { defaultCallerIdName, defaultVoicemailGreeting, isRealLineNumber } from "../lib/business-line-shared";

// ── client state ─────────────────────────────────────────────────────────────
{
  const s = { callId: "c1", leg: "agent" as const, stage: "whisper" as const };
  const enc = encodeState(s);
  assert.match(enc, /^[A-Za-z0-9+/=]+$/); // Telnyx wants plain base64
  assert.deepEqual(decodeState(enc), s);
  assert.equal(decodeState(null), null);
  assert.equal(decodeState("not base64 json"), null);
  assert.equal(decodeState(Buffer.from(JSON.stringify({ callId: "x", leg: "nope" })).toString("base64")), null);
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

// ── small helpers ────────────────────────────────────────────────────────────
assert.equal(talkSeconds(null, now), null);
assert.equal(talkSeconds(ago(65_400), now), 65);
assert.equal(fmtDuration(65), "1:05");
assert.equal(fmtDuration(0), "0:00");
assert.ok(AGENT_RING_SECS < 30, "the cell must stop ringing before its carrier voicemail would answer");
assert.equal(isRealLineNumber("pending:abc"), false);
assert.equal(isRealLineNumber("+18334950229"), true);

console.log("test-voice: all assertions passed");
