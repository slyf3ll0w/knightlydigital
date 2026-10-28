/**
 * Unit tests for the pure rules behind "Add a person to a call"
 * (lib/voice-conference.ts) and the client_state codec extension in
 * lib/voice.ts:
 *   npx tsx scripts/test-voice-conference.ts
 * Needs a placeholder DATABASE_URL (lib/voice imports Prisma, never queries).
 */
import assert from "node:assert/strict";
import {
  MAX_PARTICIPANTS,
  actorLeg,
  canAddParticipant,
  handOffAfterLeave,
  holdTargets,
  inviteLine,
  isRealLegId,
  joinedCount,
  liveLegs,
  othersRemain,
  participantStatusAfterHangup,
  participantWord,
  peopleOnCall,
  redButtonMode,
  seatsTaken,
  type ConferenceCallLite,
  type ParticipantLite,
} from "../lib/voice-conference";
import { decodeState, encodeState } from "../lib/voice";

const call: ConferenceCallLite = {
  status: "IN_PROGRESS",
  direction: "INBOUND",
  via: "app",
  telnyxCallId: "cust",
  agentCallId: "agent",
  userId: null,
  answeredByUserId: "dave",
  conferenceId: "conf1",
};

const p = (over: Partial<ParticipantLite> & { id: string }): ParticipantLite => ({
  kind: "number",
  status: "joined",
  userId: null,
  telnyxCallId: `leg-${over.id}`,
  joinedAt: new Date("2026-10-28T10:00:00Z"),
  createdAt: new Date("2026-10-28T09:59:00Z"),
  ...over,
});

// ── status after a leg hangs up ─────────────────────────────────────────────
{
  assert.equal(participantStatusAfterHangup("joined", "normal_clearing"), "left");
  assert.equal(participantStatusAfterHangup("ringing", "timeout"), "no_answer");
  assert.equal(participantStatusAfterHangup("ringing", "user_busy"), "no_answer");
  assert.equal(participantStatusAfterHangup("ringing", null), "no_answer");
  assert.equal(participantStatusAfterHangup("ringing", "unallocated_number"), "failed");
  assert.equal(participantStatusAfterHangup("left", "timeout"), "left", "a final status stays");
  assert.equal(participantStatusAfterHangup("no_answer", "x"), "no_answer");
}

// ── the cap: customer + you + 2 ─────────────────────────────────────────────
{
  assert.equal(MAX_PARTICIPANTS, 4);
  assert.equal(seatsTaken([]), 0);
  assert.equal(peopleOnCall([]), 2);
  assert.deepEqual(canAddParticipant(call, []), { ok: true });
  const two = [p({ id: "a" }), p({ id: "b", status: "ringing" })];
  assert.equal(seatsTaken(two), 2, "a ringing person takes a seat");
  const full = canAddParticipant(call, two);
  assert.equal(full.ok, false);
  assert.match(full.ok ? "" : full.reason, /4 people/);
  const gone = [p({ id: "a", status: "left" }), p({ id: "b", status: "no_answer" }), p({ id: "c", status: "failed" })];
  assert.equal(seatsTaken(gone), 0, "left / no answer / failed free the seat");
  assert.deepEqual(canAddParticipant(call, gone), { ok: true });
  assert.equal(canAddParticipant({ status: "RINGING" }, []).ok, false, "not before the customer is on");
  assert.equal(canAddParticipant({ status: "COMPLETED" }, []).ok, false);
}

// ── whose leg is whose ──────────────────────────────────────────────────────
{
  assert.deepEqual(actorLeg(call, [], "dave"), { kind: "agent", telnyxCallId: "agent" });
  assert.equal(actorLeg(call, [], "mike"), null, "an owner watching from the Calls page has no leg");
  const mike = p({ id: "m", kind: "team", userId: "mike" });
  assert.deepEqual(actorLeg(call, [mike], "mike"), { kind: "participant", telnyxCallId: "leg-m", participantId: "m" });
  assert.equal(actorLeg(call, [p({ id: "m", kind: "team", userId: "mike", status: "ringing" })], "mike"), null, "not while still ringing");
  // The one who placed an outbound call from the app owns the agent leg
  const out: ConferenceCallLite = { ...call, direction: "OUTBOUND", userId: "sue", answeredByUserId: null };
  assert.deepEqual(actorLeg(out, [], "sue"), { kind: "agent", telnyxCallId: "agent" });
  assert.equal(actorLeg({ ...out, via: "cell" }, [], "sue"), null, "the cell has no app leg to act with");
  assert.equal(actorLeg({ ...call, agentCallId: "pending:x" }, [], "dave"), null, "a claim token is not a leg");
}

// ── hold targets: everyone but me ───────────────────────────────────────────
{
  const parts = [p({ id: "a" }), p({ id: "b", status: "ringing", telnyxCallId: "leg-b" }), p({ id: "c", status: "left" })];
  assert.deepEqual(liveLegs(call, parts), ["cust", "agent", "leg-a"], "ringing and left legs are not in the mix");
  assert.deepEqual(holdTargets(call, parts, "agent"), ["cust", "leg-a"]);
  assert.deepEqual(holdTargets(call, parts, "leg-a"), ["cust", "agent"], "a joined teammate holding keeps themselves out of the music");
  assert.deepEqual(holdTargets(call, parts, null), ["cust", "agent", "leg-a"]);
  assert.deepEqual(liveLegs({ ...call, agentCallId: null }, parts), ["cust", "leg-a"], "the answerer who left is not a leg any more");
}

// ── the red button and who stays ────────────────────────────────────────────
{
  assert.equal(redButtonMode([]), "hangup");
  assert.equal(redButtonMode([p({ id: "a", status: "ringing" })]), "hangup", "a person still ringing is not on the call yet");
  assert.equal(redButtonMode([p({ id: "a" })]), "leave");
  assert.equal(othersRemain(call, [p({ id: "a" })], "agent"), true, "the supplier stays when the answerer leaves");
  assert.equal(othersRemain(call, [p({ id: "a" })], "leg-a"), true, "the answerer is still on when the supplier leaves");
  assert.equal(othersRemain(call, [], "agent"), false, "answerer leaving a two-way call: nobody else");
  assert.equal(othersRemain({ agentCallId: null }, [p({ id: "a" })], "leg-a"), false, "the answerer already left and the only other person is the one leaving");
  assert.equal(othersRemain({ agentCallId: null }, [p({ id: "a", status: "left" })], null), false);
  assert.equal(othersRemain({ agentCallId: "pending:x" }, [], null), false, "a claim token is not a person");
}

// ── the warm transfer ───────────────────────────────────────────────────────
{
  const supplier = p({ id: "s", kind: "number" });
  const mike = p({ id: "m", kind: "team", userId: "mike", joinedAt: new Date("2026-10-28T10:05:00Z") });
  const ann = p({ id: "n", kind: "team", userId: "ann", joinedAt: new Date("2026-10-28T10:02:00Z") });
  assert.equal(handOffAfterLeave([supplier], "agent"), null, "a supplier does not take over the call");
  assert.equal(handOffAfterLeave([supplier, mike], "agent"), "mike");
  assert.equal(handOffAfterLeave([mike, ann], "agent"), "ann", "earliest joined teammate takes it");
  assert.equal(handOffAfterLeave([mike, ann], "leg-n"), "mike", "never the one leaving");
  assert.equal(handOffAfterLeave([p({ id: "r", kind: "team", userId: "ray", status: "ringing" })], "agent"), null, "not someone still ringing");
}

// ── log row and copy ────────────────────────────────────────────────────────
{
  assert.equal(joinedCount([p({ id: "a" }), p({ id: "b", status: "left" }), p({ id: "c", status: "no_answer" })]), 2);
  assert.equal(inviteLine("Dave Lessly", "Sarah Chen"), "Dave wants to add you to the call with Sarah Chen");
  assert.equal(inviteLine("", "(469) 555-0100"), "A teammate wants to add you to the call with (469) 555-0100");
  assert.equal(participantWord("ringing"), "Ringing…");
  assert.equal(participantWord("joined"), "On the call");
  assert.equal(participantWord("no_answer"), "No answer");
  assert.equal(isRealLegId("abc"), true);
  assert.equal(isRealLegId("pending:x"), false);
  assert.equal(isRealLegId(null), false);
}

// ── client_state carries the participant ────────────────────────────────────
{
  const s = encodeState({ callId: "c1", leg: "participant", stage: "ring", participantId: "p9" });
  assert.deepEqual(decodeState(s), { callId: "c1", leg: "participant", stage: "ring", participantId: "p9" });
  const app = encodeState({ callId: "c1", leg: "app", stage: "ring", userId: "mike", participantId: "p9" });
  assert.deepEqual(decodeState(app), { callId: "c1", leg: "app", stage: "ring", userId: "mike", participantId: "p9" });
  assert.equal(decodeState(Buffer.from(JSON.stringify({ callId: "c1", leg: "nope" })).toString("base64")), null);
  assert.equal(decodeState(encodeState({ callId: "c1", leg: "customer", stage: "conference" }))?.stage, "conference");
}

console.log("test-voice-conference: all assertions passed");
