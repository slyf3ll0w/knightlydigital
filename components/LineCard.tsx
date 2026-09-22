"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Mic, PhoneCall, Settings2 } from "lucide-react";
import { fmtPhone } from "@/lib/format";
import { softphone, softphoneIdle, useSoftphone } from "@/lib/softphone-client";

/**
 * The sheet at the top of /app/calls: the business number as the headline,
 * where calls ring right now (this browser, then the cell), the dialer, and
 * a stat strip in the foot. Also the one place that says out loud why calls
 * do or don't ring in this browser (connecting, another tab, switched off,
 * microphone blocked), so an owner never has to guess.
 */
export type LineStats = {
  today: number;
  missedUnseen: number;
  voicemailsUnseen: number;
  /** Talk time over the last 7 days, in seconds. */
  talkWeekSec: number;
};

export default function LineCard({
  lineNumber,
  forwardTo,
  manager,
  stats,
}: {
  lineNumber: string;
  forwardTo: string | null;
  manager: boolean;
  stats: LineStats;
}) {
  const s = useSoftphone();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = softphoneIdle(s);

  async function call() {
    if (!to.trim()) return;
    setBusy(true);
    setError("");
    try {
      await softphone.placeCall({ to: to.trim() });
      setTo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the call.");
    } finally {
      setBusy(false);
    }
  }

  // Where a call rings right now, in one sentence.
  const cell = forwardTo ? fmtPhone(forwardTo) : null;
  let where: React.ReactNode;
  let dot = "bg-gray-300";
  if (s.status === "ready" && s.call) {
    where = "On a call in this browser";
    dot = "bg-green-500";
  } else if (s.status === "ready") {
    where = cell ? `Rings here first, then ${cell}` : "Rings here — add a ring-through number for when the browser is closed";
    dot = "bg-green-500";
  } else if (s.status === "connecting") {
    where = "Connecting to your line…";
    dot = "bg-gray-300 animate-pulse";
  } else if (s.status === "error") {
    where = "Reconnecting to your line…";
    dot = "bg-amber-500";
  } else if (s.reason === "other_tab") {
    where = "Ringing in your other WorkBench tab";
    dot = "bg-green-500";
  } else if (s.reason === "disabled") {
    where = cell ? `Rings ${cell} — calls in the app are off in My Profile` : "Calls in the app are off in My Profile";
  } else if (s.reason === "native") {
    where = cell ? `Rings ${cell}` : "Add a ring-through number";
  } else {
    where = cell ? `Rings ${cell}${s.reason === "unsupported" ? " — this browser can't take calls" : ""}` : "Add a ring-through number";
  }
  const showDialer = s.status !== "off" || s.reason === "other_tab";

  const talkMin = Math.round(stats.talkWeekSec / 60);

  return (
    <div className="card-tool mt-5 overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            Business line
          </p>
          <p className="numeral-ledger mt-1 text-[28px] font-semibold leading-tight text-gray-900 sm:text-3xl">{fmtPhone(lineNumber)}</p>
          <p className="mt-2 text-sm text-gray-600">{where}</p>
          {s.status === "ready" && s.mic === "denied" && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              The microphone is blocked for this site, so calls can&apos;t be answered here. Click the icon left of the address bar, allow it,
              then reload.
            </p>
          )}
          {s.status === "ready" && s.mic === "prompt" && !s.call && (
            <button
              type="button"
              onClick={() => void softphone.requestMic()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              <Mic size={12} /> Allow the microphone now so the first call doesn&apos;t stall on the prompt
            </button>
          )}
        </div>
        {showDialer && (
          <form
            className="flex w-full items-center gap-2 lg:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              void call();
            }}
          >
            <input
              type="tel"
              inputMode="tel"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Dial a number"
              aria-label="Number to call"
              disabled={!ready}
              className="numeral-ledger min-w-0 flex-1 rounded-[10px] border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] text-gray-900 placeholder:font-sans placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:opacity-50 lg:w-52 lg:flex-none"
            />
            <button
              type="submit"
              disabled={!ready || busy || !to.trim()}
              className="btn-primary shrink-0"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
              Call
            </button>
          </form>
        )}
      </div>
      {error && (
        <p className="px-5 pb-3 text-xs text-red-600 sm:px-6" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50/60 sm:grid-cols-4">
        <Stat label="Today" value={String(stats.today)} />
        <Stat label="Missed" value={String(stats.missedUnseen)} tone={stats.missedUnseen ? "text-red-700" : undefined} hint={stats.missedUnseen ? "not yet seen" : undefined} />
        <Stat label="Voicemails" value={String(stats.voicemailsUnseen)} tone={stats.voicemailsUnseen ? "text-blue-700" : undefined} hint={stats.voicemailsUnseen ? "unheard" : undefined} />
        <Stat label="Talk time" value={talkMin < 60 ? `${talkMin}m` : `${Math.floor(talkMin / 60)}h ${talkMin % 60}m`} hint="last 7 days" />
      </div>
      {manager && (
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-2.5 sm:px-6">
          <p className="text-xs text-gray-500">Ring-through number, voicemail greeting and caller ID live in Settings.</p>
          <Link href="/app/settings?s=features" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gray-700 hover:underline">
            <Settings2 size={12} /> Line settings
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="px-5 py-3 sm:px-6">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className={`numeral-ledger mt-0.5 text-xl font-semibold leading-none ${tone ?? "text-gray-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
