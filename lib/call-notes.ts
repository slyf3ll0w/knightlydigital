/**
 * Call notes — the person's own, and the ones Atlas takes.
 *
 * Every call row (lib/voice.ts) can carry `notes`, typed on the call screen
 * during or after the call (PATCH /api/app/calls/[id] { notes }). "Let Atlas
 * take notes" adds a second layer on a live call: Telnyx transcribes the
 * customer leg (`transcription_start`, both tracks — lib/voice.ts
 * startAtlasNotes) and every final segment lands here as one line of
 * `transcript` ("Them: …" / "You: …"). When the call ends, or the person
 * presses Stop, `summarizeCallNotes` turns the transcript into short notes
 * through the same metered one-shot the estimate tools use
 * (lib/atlas-oneshot.ts) — so it costs Atlas tokens, is logged as kind
 * "call-notes", and is refused when the company's meter is spent.
 *
 * State machine on Call.atlasNotesState:
 *   null → "listening" (transcription running)
 *        → "summarizing" (claimed by whichever path got there first: the
 *           hangup webhook, Stop, or the stale sweep)
 *        → "done" | "failed"
 * The claim is a conditional updateMany so a webhook retry and a Stop click
 * can't both pay for a summary.
 *
 * Pure parts (transcriptLine, appendTranscriptText, atlasNotesPrompt) are
 * unit-tested in scripts/test-call-notes.ts.
 */

import { prisma } from "@/lib/db";
import { meteredOneShot } from "@/lib/atlas-oneshot";

export type AtlasNotesState = "listening" | "summarizing" | "done" | "failed";

/** The transcript is capped so a four-hour call can't grow a row without bound (~10k words). */
export const TRANSCRIPT_MAX_CHARS = 60_000;
/** Below this there is nothing worth paying a model to summarize. */
export const TRANSCRIPT_MIN_CHARS = 20;

export const NOTES_MAX_CHARS = 20_000;

/**
 * One stored transcript line from a Telnyx `call.transcription` segment.
 * Transcription runs on the CUSTOMER leg with `transcription_tracks: "both"`:
 * the inbound track is audio arriving from the customer (them), the outbound
 * track is what the line sends them (you). Unknown track = unlabeled.
 */
export function transcriptLine(track: string | null | undefined, text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const who = track === "inbound" ? "Them" : track === "outbound" ? "You" : null;
  return who ? `${who}: ${t}` : t;
}

/** Append a line; once the cap is reached the newest lines are dropped (the start of a call is what notes need most). */
export function appendTranscriptText(existing: string | null | undefined, line: string, max = TRANSCRIPT_MAX_CHARS): string {
  const base = existing ?? "";
  if (base.length >= max) return base;
  return `${base}${line}\n`.slice(0, max);
}

export type NotesContext = {
  direction: "INBOUND" | "OUTBOUND";
  /** Who was on the other end — the contact's name, else the number. */
  party: string;
  /** "lead" / "client" / "" — so the notes can speak to where they stand. */
  standing: string;
  businessName: string;
  assistantName: string;
  /** Talk time in seconds, when known. */
  durationSec: number | null;
};

/** The system + user prompt for the summary. Pure. */
export function atlasNotesPrompt(transcript: string, ctx: NotesContext): { system: string; prompt: string } {
  const system = [
    `You are ${ctx.assistantName}, the assistant inside WorkBench, a field-service business app. You write call notes for ${ctx.businessName}.`,
    "Write the notes a good office manager would leave on the customer's card after the call: what they wanted, the details that matter (address or area, the job, timing, prices or budget mentioned, who else is involved), what was decided, and what has to happen next.",
    "Rules: plain text only — short lines starting with \"- \", no headings, no markdown, no preamble, no sign-off. 3 to 10 lines. Use the customer's own words for names, addresses and amounts; never invent details that aren't in the transcript. The transcript is machine-made and may mishear — when a detail is unclear, say so briefly rather than guessing. If the transcript holds nothing useful (a wrong number, a hang-up, noise), answer with one line saying so.",
    "The speaker labels: \"You\" is the team member on the business line, \"Them\" is the caller or customer. Unlabeled lines could be either.",
  ].join("\n");
  const who = ctx.standing ? `${ctx.party} (${ctx.standing})` : ctx.party;
  const dur = ctx.durationSec !== null ? `${Math.floor(ctx.durationSec / 60)}:${String(ctx.durationSec % 60).padStart(2, "0")}` : null;
  const prompt = [
    `${ctx.direction === "INBOUND" ? "Incoming call from" : "Outgoing call to"} ${who}${dur ? ` · ${dur} on the line` : ""}.`,
    "",
    "Transcript:",
    transcript.trim(),
    "",
    "Write the call notes.",
  ].join("\n");
  return { system, prompt };
}

/** Add one final transcript segment to the row (only while Atlas is on the call). Never throws. */
export async function appendTranscript(callId: string, line: string): Promise<void> {
  try {
    // A single UPDATE appends in place — segments for one call arrive one
    // at a time, but a read-modify-write would still race a Stop click.
    await prisma.$executeRaw`
      UPDATE "Call"
      SET "transcript" = left(coalesce("transcript", '') || ${line} || E'\n', ${TRANSCRIPT_MAX_CHARS})
      WHERE "id" = ${callId} AND "atlasNotesState" IN ('listening', 'summarizing')`;
  } catch (err) {
    console.error(`[call-notes] transcript append failed for ${callId}:`, err);
  }
}

export type AtlasNotesSnapshot = {
  state: AtlasNotesState | null;
  notes: string | null;
  error: string | null;
  tokens: number | null;
};

/**
 * Turn the transcript into notes. Claims "listening" → "summarizing" first, so
 * only one of the callers (hangup webhook, Stop, stale sweep) pays. Returns
 * the row's Atlas state afterwards; never throws — a failed summary is
 * written to the row as "failed" with the reason.
 */
export async function summarizeCallNotes(callId: string): Promise<AtlasNotesSnapshot> {
  const claimed = await prisma.call.updateMany({
    where: { id: callId, atlasNotesState: "listening" },
    data: { atlasNotesState: "summarizing" },
  });
  const snapshot = async (): Promise<AtlasNotesSnapshot> => {
    const c = await prisma.call.findUnique({
      where: { id: callId },
      select: { atlasNotesState: true, atlasNotes: true, atlasNotesError: true, atlasNotesTokens: true },
    });
    return { state: (c?.atlasNotesState as AtlasNotesState | null) ?? null, notes: c?.atlasNotes ?? null, error: c?.atlasNotesError ?? null, tokens: c?.atlasNotesTokens ?? null };
  };
  if (claimed.count === 0) return snapshot();

  const fail = async (error: string): Promise<AtlasNotesSnapshot> => {
    await prisma.call.update({ where: { id: callId }, data: { atlasNotesState: "failed", atlasNotesError: error, atlasNotesAt: new Date() } }).catch(() => {});
    return { state: "failed", notes: null, error, tokens: null };
  };

  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      companyId: true,
      direction: true,
      transcript: true,
      durationSec: true,
      customerNumber: true,
      atlasNotesUserId: true,
      company: { select: { name: true, assistantName: true } },
      contact: { select: { firstName: true, lastName: true, status: true } },
    },
  });
  if (!call) return fail("Call not found.");
  const assistantName = call.company.assistantName || "Atlas";
  const transcript = (call.transcript ?? "").trim();
  if (transcript.length < TRANSCRIPT_MIN_CHARS) {
    return fail(`${assistantName} didn't hear enough to write notes from — nothing came through on the line.`);
  }
  if (!call.atlasNotesUserId) return fail("Nobody is on record as having asked for notes.");

  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  const { system, prompt } = atlasNotesPrompt(transcript, {
    direction: call.direction,
    party: name || call.customerNumber,
    standing: call.contact?.status === "LEAD" ? "lead" : call.contact?.status === "ACTIVE" ? "client" : "",
    businessName: call.company.name,
    assistantName,
    durationSec: call.durationSec,
  });
  try {
    const res = await meteredOneShot(
      { id: call.atlasNotesUserId, companyId: call.companyId },
      { kind: "call-notes", system, prompt, maxOutputTokens: 700, temperature: 0.3, thinkingBudget: 256 }
    );
    if (!res.ok) return fail(res.error);
    const text = res.text.trim().slice(0, NOTES_MAX_CHARS);
    await prisma.call.update({
      where: { id: callId },
      data: { atlasNotesState: "done", atlasNotes: text, atlasNotesError: null, atlasNotesAt: new Date(), atlasNotesTokens: res.atlasTokens },
    });
    return { state: "done", notes: text, error: null, tokens: res.atlasTokens };
  } catch (err) {
    console.error(`[call-notes] summary failed for ${callId}:`, err);
    return fail(`${assistantName} couldn't write the notes just now — the transcript is kept, try again from the call screen.`);
  }
}
