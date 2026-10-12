/**
 * Who ended a connected call. Pure, shared by the webhook (lib/voice.ts
 * stores the verdict on Call.endedBy) and the Calls UI (the word after the
 * talk time). Tests: scripts/test-voice.ts.
 *
 * Telnyx says, per leg, which end of THAT leg hung up (`hangup_source`:
 * caller / callee / unknown) and why (`hangup_cause`). The customer leg is
 * the one whose hangup closes a bridged row, so its verdict is the usual
 * one; the agent leg (the cell or the browser we dialed) gets to answer
 * first when its webhook lands first — the two agree, Telnyx tears the
 * other leg down for whoever hung up.
 *
 *   customer leg, inbound   caller = them  (they dialed the line)
 *   customer leg, outbound  caller = us    (we dialed them)
 *   agent leg               caller = us    (we always dial our own side; a
 *                           platform-side hangup on it means the other
 *                           party is gone, so "caller" reads as them)
 *
 * Anything but a clean clearing on a connected call is a drop — a carrier
 * timer, media loss, Telnyx's own 4 h leg cap — whoever's side it fell on.
 */
export type CallEnding = "them" | "us" | "network";

export type CallLeg = "customer" | "agent";
export type CallDirectionWord = "INBOUND" | "OUTBOUND";

/** The hangup causes that mean somebody simply hung up. */
const CLEAN_CAUSES = new Set(["normal_clearing", "normal_unspecified"]);

export function callEnding(leg: CallLeg, direction: CallDirectionWord, cause: string | null | undefined, source: string | null | undefined): CallEnding | null {
  if (cause && !CLEAN_CAUSES.has(cause)) return "network";
  const theyAreCaller = leg === "customer" ? direction === "INBOUND" : false;
  if (source === "caller") return leg === "agent" ? "them" : theyAreCaller ? "them" : "us";
  if (source === "callee") return leg === "agent" ? "us" : theyAreCaller ? "us" : "them";
  return null;
}

/** The word on the call row / call screen; null for an older row with no verdict. */
export function endingLabel(endedBy: string | null | undefined): string | null {
  switch (endedBy) {
    case "them":
      return "They hung up";
    case "us":
      return "You hung up";
    case "network":
      return "Call dropped";
    default:
      return null;
  }
}
