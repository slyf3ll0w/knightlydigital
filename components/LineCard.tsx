"use client";

import { useState } from "react";
import Link from "next/link";
import { Grid3x3, Mic, Settings2, X } from "lucide-react";
import { fmtPhone } from "@/lib/format";
import { softphone, useSoftphone, type SoftphoneState } from "@/lib/softphone-client";
import DialPad from "@/components/DialPad";
import { MicCheck } from "@/components/MicControls";
import Modal from "@/components/Modal";

/**
 * The business line on /app/calls, in three pieces that share one sentence
 * about where calls ring right now (this browser, another tab, the cell,
 * switched off, microphone blocked — an owner never has to guess):
 *
 *   LinePanel  — desktop: the phone itself, a sticky sheet in the left
 *                column next to the recents list (the softphone layout —
 *                keypad on the left, calls on the right). Number up top,
 *                the keypad, the microphone check, a stat foot.
 *   LineStrip  — phones: one row above the list — number, where it rings,
 *                a gear for owners.
 *   KeypadFab  — phones: the green keypad button above the tab bar; opens
 *                the keypad as a bottom sheet (Modal → sheet under lg) with
 *                the big keys.
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
      dot: "bg-green-500",
    };
  }
  if (s.status === "ready") return { where: cell ? `Rings here first, then ${cell}` : "Rings here — add a ring-through number for when the app is closed", dot: "bg-green-500" };
  if (s.status === "connecting") return { where: "Connecting to your line…", dot: "bg-gray-300 animate-pulse" };
  if (s.status === "error") return { where: "Reconnecting to your line…", dot: "bg-amber-500" };
  if (s.reason === "other_tab") return { where: "Ringing in your other WorkBench tab", dot: "bg-green-500" };
  if (s.reason === "disabled") return { where: cell ? `Rings ${cell} — calls in the app are off in My Profile` : "Calls in the app are off in My Profile", dot: "bg-gray-300" };
  if (s.reason === "native") return { where: cell ? `Rings ${cell}` : "Add a ring-through number", dot: "bg-gray-300" };
  return { where: cell ? `Rings ${cell}${s.reason === "unsupported" ? " — this browser can't take calls" : ""}` : "Add a ring-through number", dot: "bg-gray-300" };
}

/* ───────────────────────────── Desktop ───────────────────────────── */

export function LinePanel({
  lineNumber,
  forwardTo,
  manager,
  stats,
  className = "",
}: {
  lineNumber: string;
  forwardTo: string | null;
  manager: boolean;
  stats: LineStats;
  className?: string;
}) {
  const s = useSoftphone();
  const { where, dot } = useWhere(s, forwardTo);
  const inBrowser = s.status === "ready";
  const talkMin = Math.round(stats.talkWeekSec / 60);

  return (
    <aside className={`card-tool overflow-hidden ${className}`}>
      <div className="px-5 pt-5">
        <p className="flex items-center gap-2 text-[12px] font-medium text-gray-500">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          Business line
        </p>
        <p className="numeral-ledger mt-1 text-[24px] font-semibold leading-tight text-gray-900">{fmtPhone(lineNumber)}</p>
        <p className="mt-1 text-[13px] leading-snug text-gray-500">{where}</p>
        {s.status === "ready" && s.mic === "denied" && (
          <p className="mt-2 text-xs text-red-700" role="alert">
            The microphone is blocked for this site, so calls can&apos;t be answered here. Click the icon left of the address bar, allow it, then reload.
          </p>
        )}
        {s.status === "ready" && s.mic === "prompt" && !s.call && (
          <button
            type="button"
            onClick={() => void softphone.requestMic()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-1.5 text-left text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            <Mic size={12} className="shrink-0" /> Allow the microphone now so the first call doesn&apos;t stall
          </button>
        )}
      </div>

      <div className="px-5 pb-4 pt-5">
        <DialPad className="mx-auto w-[236px]" />
        <p className="mt-3 text-center text-[11px] text-gray-400">
          {inBrowser ? "Calls from the keypad go out from this browser." : "Calls from the keypad ring your cell first, then the customer."}
        </p>
      </div>

      {s.status === "ready" && s.mic !== "denied" && (
        <div className="border-t border-gray-100 px-5 py-3">
          <MicCheck />
        </div>
      )}

      <div className="grid grid-cols-2 border-t border-gray-100 bg-gray-50/60">
        <Stat label="Today" value={String(stats.today)} className="border-b border-r border-gray-100" />
        <Stat label="Missed" value={String(stats.missedUnseen)} tone={stats.missedUnseen ? "text-red-700" : undefined} hint={stats.missedUnseen ? "not yet seen" : undefined} className="border-b border-gray-100" />
        <Stat label="Voicemails" value={String(stats.voicemailsUnseen)} tone={stats.voicemailsUnseen ? "text-blue-700" : undefined} hint={stats.voicemailsUnseen ? "unheard" : undefined} className="border-r border-gray-100" />
        <Stat label="Talk time" value={talkMin < 60 ? `${talkMin}m` : `${Math.floor(talkMin / 60)}h ${talkMin % 60}m`} hint="last 7 days" />
      </div>

      {manager && (
        <Link
          href="/app/settings?s=phone"
          className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
        >
          <span>Ring-through number, greeting, caller ID</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-700">
            <Settings2 size={12} /> Line settings
          </span>
        </Link>
      )}
    </aside>
  );
}

function Stat({ label, value, tone, hint, className = "" }: { label: string; value: string; tone?: string; hint?: string; className?: string }) {
  return (
    <div className={`px-5 py-3 ${className}`}>
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className={`numeral-ledger mt-0.5 text-xl font-semibold leading-none ${tone ?? "text-gray-900"}`}>{value}</p>
      <p className="mt-1 min-h-[14px] text-[11px] leading-[14px] text-gray-400">{hint ?? ""}</p>
    </div>
  );
}

/* ───────────────────────────── Phones ───────────────────────────── */

export function LineStrip({
  lineNumber,
  forwardTo,
  manager,
  className = "",
}: {
  lineNumber: string;
  forwardTo: string | null;
  manager: boolean;
  className?: string;
}) {
  const s = useSoftphone();
  const { where, dot } = useWhere(s, forwardTo);
  return (
    <div className={`card-tool flex items-center gap-3 px-4 py-3 ${className}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="numeral-ledger text-[17px] font-semibold leading-tight text-gray-900">{fmtPhone(lineNumber)}</p>
        <p className="truncate text-[13px] text-gray-500">{where}</p>
        {s.status === "ready" && s.mic === "denied" && (
          <p className="mt-1 text-xs text-red-700" role="alert">
            The microphone is blocked for this site — calls can&apos;t be answered here.
          </p>
        )}
      </div>
      {manager && (
        <Link
          href="/app/settings?s=phone"
          aria-label="Line settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
        >
          <Settings2 size={16} />
        </Link>
      )}
    </div>
  );
}

/**
 * The keypad on a phone: a green round button pinned above the tab bar's
 * Create button (same 58px hardware), opening the keypad as a bottom sheet.
 * Hidden while a call is up in this app — the call screen has the tones.
 */
export function KeypadFab() {
  const s = useSoftphone();
  const [open, setOpen] = useState(false);
  const inApp = s.status === "ready";
  if (s.status === "ready" && s.call) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Keypad"
        className="theme-fixed fixed right-3 z-30 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-green-500 text-white shadow-[0_6px_18px_rgba(34,197,94,0.38)] transition-transform active:scale-95 lg:hidden"
        style={{ bottom: "calc(0.625rem + env(safe-area-inset-bottom) + 58px + 12px)" }}
      >
        <Grid3x3 size={24} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" portal>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-gray-500">Keypad</p>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
        <DialPad size="lg" />
        <p className="mt-4 text-center text-xs text-gray-400">{inApp ? "Goes out from this phone." : "Rings your cell first, then the customer."}</p>
      </Modal>
    </>
  );
}
