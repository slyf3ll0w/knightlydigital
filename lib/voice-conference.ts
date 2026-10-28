/**
 * Add a person to a live call — the pure rules (lib/voice.ts does the
 * Telnyx and database work; `npx tsx scripts/test-voice-conference.ts`
 * covers everything here).
 *
 * A call starts as two legs bridged by Call Control: the customer
 * (Call.telnyxCallId) and the person who answered or placed it
 * (Call.agentCallId). The first "Add" promotes that pair into a Telnyx
 * conference (Call.conferenceId) and every added person is a
 * CallParticipant row: a teammate rung in the app, a client/lead dialed
 * from the line, or a typed number. The customer and the answerer stay on
 * the Call row — nothing that reads a call today has to change — and the
 * call screen merges them with the participants for its strip.
 *
 * Plan: docs/plans/conference-calls-2026-10-28.md.
 */

export type ParticipantKind = "team" | "contact" | "number";
export type ParticipantStatus = "ringing" | "joined" | "left" | "no_answer" | "failed";

/** The columns the rules need; the Prisma row satisfies it. */
export type ParticipantLite = {
  id: string;
  kind: ParticipantKind | string;
  status: ParticipantStatus | string;
  userId: string | null;
  telnyxCallId: string | null;
  joinedAt?: Date | string | null;
  createdAt?: Date | string;
};

/** The call columns the rules need. */
export type ConferenceCallLite = {
  status: string;
  direction: "INBOUND" | "OUTBOUND";
  via?: string | null;
  telnyxCallId: string | null;
  agentCallId: string | null;
  userId?: string | null;
  answeredByUserId?: string | null;
  conferenceId?: string | null;
};

/** People on one call, the customer and the answerer included: customer + you + 2 added. */
export const MAX_PARTICIPANTS = 4;

/** How long an added number rings before it counts as no answer (a supplier's voicemail would pick up at ~25 s). */
export const PARTICIPANT_RING_SECS = 30;

/** A Telnyx call_control_id we actually hold (not a "pending:" claim token). */
export const isRealLegId = (id: string | null | undefined): id is string => Boolean(id && !id.startsWith("pending:"));

const NO_ANSWER_CAUSES = new Set(["timeout", "no_answer", "user_busy", "call_rejected", "originator_cancel", "normal_clearing"]);

/**
 * Where a participant lands when their leg hangs up:
 *   joined                     → left
 *   ringing, "nobody there"    → no_answer (timeout, busy, rejected, they hung up first)
 *   ringing, anything else     → failed (number unreachable, carrier error)
 *   already final              → unchanged
 */
export function participantStatusAfterHangup(status: ParticipantStatus | string, cause: string | null | undefined): ParticipantStatus {
  if (status === "joined") return "left";
  if (status === "ringing") return !cause || NO_ANSWER_CAUSES.has(cause) ? "no_answer" : "failed";
  return status as ParticipantStatus;
}

/** Participants still taking a seat: ringing or joined. */
export function seatsTaken(participants: ParticipantLite[]): number {
  return participants.filter((p) => p.status === "ringing" || p.status === "joined").length;
}

/** People on the call right now, the customer and the answerer included. */
export function peopleOnCall(participants: ParticipantLite[]): number {
  return 2 + seatsTaken(participants);
}

/** May one more person be added? The reason is what the sheet shows. */
export function canAddParticipant(call: Pick<ConferenceCallLite, "status">, participants: ParticipantLite[]): { ok: true } | { ok: false; reason: string } {
  if (call.status !== "IN_PROGRESS") return { ok: false, reason: "The call isn't connected yet." };
  if (peopleOnCall(participants) >= MAX_PARTICIPANTS) return { ok: false, reason: `A call can have ${MAX_PARTICIPANTS} people on it.` };
  return { ok: true };
}

export type ActorLeg = { kind: "agent"; telnyxCallId: string } | { kind: "participant"; telnyxCallId: string; participantId: string };

/**
 * Which leg belongs to the signed-in person: the answerer's / caller's leg
 * (`agentCallId`) when they answered or placed the call, a joined teammate's
 * participant leg, else null (an owner watching from the Calls page).
 */
export function actorLeg(call: ConferenceCallLite, participants: ParticipantLite[], actorId: string): ActorLeg | null {
  const owns = call.answeredByUserId === actorId || (call.direction === "OUTBOUND" && call.userId === actorId && call.via === "app");
  if (owns && isRealLegId(call.agentCallId)) return { kind: "agent", telnyxCallId: call.agentCallId };
  const mine = participants.find((p) => p.kind === "team" && p.userId === actorId && p.status === "joined" && isRealLegId(p.telnyxCallId));
  if (mine && mine.telnyxCallId) return { kind: "participant", telnyxCallId: mine.telnyxCallId, participantId: mine.id };
  return null;
}

/** Every leg currently in the mix: the customer, the answerer (if their leg is real) and each joined participant. */
export function liveLegs(call: ConferenceCallLite, participants: ParticipantLite[]): string[] {
  const out: string[] = [];
  if (isRealLegId(call.telnyxCallId)) out.push(call.telnyxCallId);
  if (isRealLegId(call.agentCallId)) out.push(call.agentCallId);
  for (const p of participants) if (p.status === "joined" && isRealLegId(p.telnyxCallId)) out.push(p.telnyxCallId);
  return out;
}

/** Hold in a conference = everyone except the one pressing the button hears the music. */
export function holdTargets(call: ConferenceCallLite, participants: ParticipantLite[], actorLegId: string | null): string[] {
  return liveLegs(call, participants).filter((id) => id !== actorLegId);
}

/** The red button: "Leave" once somebody else is on the call with the customer, "Hang up" otherwise. */
export function redButtonMode(participants: ParticipantLite[]): "leave" | "hangup" {
  return participants.some((p) => p.status === "joined") ? "leave" : "hangup";
}

/**
 * The answerer left a call that still has a joined teammate on it: the call
 * is theirs now (that IS the warm transfer). Earliest joined wins; null when
 * no teammate remains (a supplier or a client alone with the customer keeps
 * the row as it was).
 */
export function handOffAfterLeave(participants: ParticipantLite[], leavingLegId: string | null): string | null {
  const team = participants
    .filter((p) => p.kind === "team" && p.status === "joined" && p.userId && p.telnyxCallId !== leavingLegId)
    .sort((a, b) => time(a.joinedAt ?? a.createdAt) - time(b.joinedAt ?? b.createdAt));
  return team[0]?.userId ?? null;
}

/**
 * Does the call go on without this leg? True while someone besides the
 * customer is still on it: the answerer (their leg is real and not the one
 * leaving) or a joined participant.
 */
export function othersRemain(call: Pick<ConferenceCallLite, "agentCallId">, participants: ParticipantLite[], leavingLegId: string | null): boolean {
  if (isRealLegId(call.agentCallId) && call.agentCallId !== leavingLegId) return true;
  return participants.some((p) => p.status === "joined" && p.telnyxCallId !== leavingLegId);
}

/** "+N" on a log row: how many people joined the call beyond the two who started it. */
export function joinedCount(participants: Array<Pick<ParticipantLite, "status">>): number {
  return participants.filter((p) => p.status === "joined" || p.status === "left").length;
}

/** The card a rung teammate sees. */
export function inviteLine(byName: string, withLabel: string): string {
  const by = byName.trim().split(" ")[0] || "A teammate";
  return `${by} wants to add you to the call with ${withLabel}`;
}

/** A participant chip's word under the name. */
export function participantWord(status: ParticipantStatus | string): string {
  switch (status) {
    case "ringing":
      return "Ringing…";
    case "joined":
      return "On the call";
    case "left":
      return "Left";
    case "no_answer":
      return "No answer";
    case "failed":
      return "Didn't connect";
    default:
      return "";
  }
}

function time(v: Date | string | null | undefined): number {
  if (!v) return Number.MAX_SAFE_INTEGER;
  return typeof v === "string" ? Date.parse(v) : v.getTime();
}
