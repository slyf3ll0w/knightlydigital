"use client";

import { Mic } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { useAssistant } from "@/components/AssistantContext";

/**
 * Home's front door to Atlas at a desk (David 2026-11-24: "redo the talk to
 * Atlas on the home dashboard, make it better and not at the bottom"). One
 * calm, wide row first under the band: the Atlas mark, "Talk to {name}", one
 * example request that changes every visit, a big mic in the company's
 * second color, and a quieter "or type" that opens the chat.
 *
 * Every example is something Atlas's tools really do (lib/assistant):
 *   schedule → create_job / schedule_appointment · owed → list_money ·
 *   invoice → create_invoice + email_document · on my way → send_on_my_way ·
 *   attention → whats_needing_attention · find a time → find_a_time ·
 *   record a check → record_payment · how's the month → business_summary
 * The page deals the example (server side) so the first paint already has it.
 * Renders nothing when Atlas is off for the company (same rule as TalkToAtlas).
 */
export const ATLAS_EXAMPLES = [
  "Schedule a job for Grace on Thursday at 9.",
  "What's still owed to me this month?",
  "Make an invoice for today's job and email it.",
  "Text my next client that I'm on my way.",
  "What needs my attention today?",
  "Find a time for a walkthrough next week.",
  "Record a $250 check from Maria.",
  "How did we do this month?",
] as const;

export default function AtlasFrontDoor({ example = 0 }: { example?: number }) {
  const atlas = useAssistant();
  if (!atlas.available) return null;
  const line = ATLAS_EXAMPLES[((example % ATLAS_EXAMPLES.length) + ATLAS_EXAMPLES.length) % ATLAS_EXAMPLES.length];
  return (
    <section className="hm-atlas" aria-label={`Talk to ${atlas.name}`}>
      <AtlasMark size={44} accent={atlas.accent} className="hm-atlas-mark shrink-0 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <p className="hm-atlas-title">Talk to {atlas.name}</p>
        <p className="hm-atlas-line">
          {atlas.locked ? (
            "Out of tokens for now — back when the meter refills."
          ) : (
            <>
              <span className="hm-atlas-try">Try</span> “{line}”
            </>
          )}
        </p>
      </div>
      <button type="button" onClick={atlas.open} className="hm-atlas-type">
        or type
      </button>
      <button type="button" onClick={atlas.talk} className="hm-atlas-mic" aria-label={`Talk to ${atlas.name}`}>
        <Mic size={22} strokeWidth={2.3} />
      </button>
    </section>
  );
}
