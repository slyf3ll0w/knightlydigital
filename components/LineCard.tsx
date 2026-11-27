"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Grid3x3, Mic } from "lucide-react";
import { fmtPhone } from "@/lib/format";
import { hapticImpact } from "@/lib/haptics";
import { softphone, useSoftphone, type SoftphoneState } from "@/lib/softphone-client";
import DialPad from "@/components/DialPad";
import { MicCheck } from "@/components/MicControls";
import Modal from "@/components/Modal";

/**
 * The business line on /app/calls, in three pieces that share one sentence
 * about where calls ring right now (this browser, another tab, the cell,
 * switched off, microphone blocked — an owner never has to guess):
 *
 *   LinePanel    — desktop: the phone itself, a sticky sheet in the left
 *                  column next to the recents list (the softphone layout —
 *                  keypad on the left, calls on the right). Number up top,
 *                  the keypad, the microphone check. No stat tiles (ticket
 *                  cmwz7vhi, 2026-11-27): the counts are the title's line.
 *   LineSub      — phones: the large title's subtitle — number, where it
 *                  rings (the gear for owners sits in the title row).
 *   KeypadButton — phones: a "Keypad" button on the line's row; opens the
 *                  keypad as a bottom sheet (Modal → sheet under lg) with
 *                  the big keys. (It was a second floating circle stacked
 *                  over the + button — ticket cmwz875g.)
 */
export type LineStats = {
  today: number;
  missedUnseen: number;
  voicemailsUnseen: number;
  /** Talk time over the last 7 days, in seconds. */
  talkWeekSec: number;
};

/** Where a call rings right now, in one sentence, and the dot that goes with it. */
function useWhere(s: SoftphoneState, forwardTo: string | null): { where: React.ReactNode; dot: string } {
  const cell = forwardTo ? fmtPhone(forwardTo) : null;
  if (s.status === "ready" && s.call) {
    return {
      where: s.call.callId ? (
        <>
          On a call here ·{" "}
          <Link href={`/app/calls/${s.call.callId}`} className="font-medium text-gray-800 underline">
            open the call screen
          </Link>
        </>
      ) : (
        "On a call here"
      ),
      dot: "bg-[color:var(--ds-good)]",
    };
  }
  if (s.status === "ready") return { where: cell ? `Rings here first, then ${cell}` : "Rings here — add a ring-through number for when the app is closed", dot: "bg-[color:var(--ds-good)]" };
  if (s.status === "connecting") return { where: "Connecting to your line…", dot: "bg-gray-300 animate-pulse" };
  if (s.status === "error") return { where: "Reconnecting to your line…", dot: "bg-[color:var(--ds-warn)]" };
  if (s.reason === "other_tab") return { where: "Ringing in your other WorkBench tab", dot: "bg-[color:var(--ds-good)]" };
  if (s.reason === "disabled") return { where: cell ? `Rings ${cell} — calls in the app are off in My Profile` : "Calls in the app are off in My Profile", dot: "bg-gray-300" };
  if (s.reason === "native") return { where: cell ? `Rings ${cell}` : "Add a ring-through number", dot: "bg-gray-300" };
  return { where: cell ? `Rings ${cell}${s.reason === "unsupported" ? " — this browser can't take calls" : ""}` : "Add a ring-through number", dot: "bg-gray-300" };
}

/* ───────────────────────────── Desktop ───────────────────────────── */

export function LinePanel({
  lineNumber,
  forwardTo,
  className = "",
}: {
  lineNumber: string;
  forwardTo: string | null;
  /** Owners/managers (the title row carries Line settings for them). */
  manager?: boolean;
  className?: string;
}) {
  const s = useSoftphone();
  const { where, dot } = useWhere(s, forwardTo);
  const inBrowser = s.status === "ready";

  return (
    <aside className={`cx-panel ${className}`}>
      <div className="px-5 pt-5">
        <p className="cx-panel-num numeral-ledger">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
          {fmtPhone(lineNumber)}
        </p>
        <p className="cx-panel-where">{where}</p>
        {s.status === "ready" && s.mic === "denied" && (
          <p className="mt-2 text-xs text-red-700" role="alert">
            The microphone is blocked for this site, so calls can&apos;t be answered here. Click the icon left of the address bar, allow it, then reload.
          </p>
        )}
        {s.status === "ready" && s.mic === "prompt" && !s.call && (
          <button
            type="button"
            onClick={() => void softphone.requestMic()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] bg-[color:var(--ds-warn-soft)] px-3 py-1.5 text-left text-xs font-medium text-[color:var(--ds-warn)] hover:bg-[color-mix(in_srgb,var(--ds-warn)_20%,transparent)]"
          >
            <Mic size={12} className="shrink-0" /> Allow the microphone now so the first call doesn&apos;t stall
          </button>
        )}
      </div>

      <div className="px-5 pb-4 pt-4">
        <DialPad className="mx-auto w-[236px]" />
        <p className="mt-3 text-center text-[11.5px] text-[color:var(--ds-faint)]">
          {inBrowser ? "Calls from the keypad go out from this browser." : "Calls from the keypad ring your cell first, then the customer."}
        </p>
      </div>

      {s.status === "ready" && s.mic !== "denied" && (
        <div className="cx-panel-mic">
          <MicCheck />
        </div>
      )}

    </aside>
  );
}

/* ───────────────────────────── Phones ───────────────────────────── */

/**
 * Phones: the line as the large title's subtitle — the number, then where
 * it rings — instead of a card of its own. (iOS puts the status under the
 * title; a card there read as one more box before the list.)
 */
export function LineSub({ lineNumber, forwardTo }: { lineNumber: string; forwardTo: string | null }) {
  const s = useSoftphone();
  const { where, dot } = useWhere(s, forwardTo);
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="numeral-ledger text-[15px] font-semibold text-gray-800">{fmtPhone(lineNumber)}</span>
      </span>
      <span className="truncate text-[13px] text-gray-500">{where}</span>
      {s.status === "ready" && s.mic === "denied" && (
        <span className="text-xs text-red-700" role="alert">
          The microphone is blocked for this site — calls can&apos;t be answered here.
        </span>
      )}
    </span>
  );
}

/**
 * The keypad on a phone: a quiet "Keypad" button on the line's row under
 * the title, opening the keypad as a bottom sheet.
 * Hidden while a call is up in this app — the call screen has the tones.
 */
export function KeypadButton() {
  const s = useSoftphone();
  const [open, setOpen] = useState(false);
  // The phone Create sheet's Call tile lands here with ?keypad=1: open the
  // pad at once and drop the flag, so a refresh or Back doesn't reopen it.
  const params = useSearchParams();
  const wantsKeypad = params.get("keypad") === "1";
  useEffect(() => {
    if (!wantsKeypad) return;
    setOpen(true);
    window.history.replaceState(window.history.state, "", "/app/calls");
  }, [wantsKeypad]);
  const inApp = s.status === "ready";
  if (s.status === "ready" && s.call) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          hapticImpact("MEDIUM");
          setOpen(true);
        }}
        className="cx-keypad-btn lg:hidden"
      >
        <Grid3x3 size={16} strokeWidth={2.4} aria-hidden />
        Keypad
      </button>
      {/* The sheet's grab handle is the close control — no title bar, like the system keypad. */}
      <Modal open={open} onClose={() => setOpen(false)} size="sm" portal>
        <DialPad size="lg" className="pt-1" />
        <p className="mt-3 text-center text-xs text-gray-400">{inApp ? "Goes out from this phone." : "Rings your cell first, then the customer."}</p>
      </Modal>
    </>
  );
}
