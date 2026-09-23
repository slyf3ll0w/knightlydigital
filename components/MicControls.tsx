"use client";

import { useState } from "react";
import { AlertTriangle, Mic } from "lucide-react";
import { softphone, useMicLevel, useSoftphone, type MicTestResult } from "@/lib/softphone-client";

/**
 * The softphone's microphone, made visible: a live level meter (the input
 * the browser is actually capturing — if the bars don't move while you talk,
 * the other side hears nothing), a picker when the machine has more than one
 * input, the watchdog's one-line warning (lib/softphone-mic.ts), and a
 * four-second test for the Calls page. Shared by the floating call card,
 * the call screen and LineCard.
 */

/** Eight cells lit from the left; the last two go amber so a hot mic reads at a glance. */
export function MicMeter({ className = "" }: { className?: string }) {
  const level = useMicLevel();
  const lit = Math.round(level * 8);
  return (
    <span className={`inline-flex items-end gap-[2px] ${className}`} aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm transition-colors duration-75 ${i < lit ? (i >= 6 ? "bg-amber-500" : "bg-green-500") : "bg-gray-200"}`}
          style={{ height: 5 + i * 1.5 }}
        />
      ))}
    </span>
  );
}

/** Which input to use; nothing at all when the browser lists only one. */
export function MicPicker({ className = "" }: { className?: string }) {
  const s = useSoftphone();
  if (s.micDevices.length < 2) return null;
  return (
    <select
      value={s.micId ?? ""}
      onChange={(e) => void softphone.setMic(e.target.value || null)}
      aria-label="Microphone"
      title="Microphone"
      className={`block w-full min-w-0 max-w-full truncate rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 ${className}`}
    >
      <option value="">Browser default</option>
      {s.micDevices.map((d) => (
        <option key={d.id} value={d.id}>
          {d.label}
        </option>
      ))}
    </select>
  );
}

/** The watchdog's verdict, when it has one. */
export function MicWarning({ className = "" }: { className?: string }) {
  const s = useSoftphone();
  if (!s.micWarning) return null;
  return (
    <p className={`flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900 ${className}`} role="alert">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      <span>{s.micWarning}</span>
    </p>
  );
}

/** Under the controls of a live call: the meter and the device's name on one line, the picker (when there is a choice) on the next. */
export function MicRow({ className = "" }: { className?: string }) {
  const s = useSoftphone();
  const muted = s.call?.muted ?? false;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex min-w-0 items-center gap-2 text-[11px] text-gray-500">
        <Mic size={12} className="shrink-0 text-gray-400" />
        <MicMeter />
        <span className="min-w-0 flex-1 truncate">{muted ? "Muted" : (s.micLabel ?? "Microphone")}</span>
      </div>
      <MicPicker className="mt-1.5" />
    </div>
  );
}

/**
 * Calls page: pick the mic and hear yourself before a call. The result is
 * a plain sentence — a working mic, a silent one (the usual one-way-audio
 * cause: the OS picked a webcam mic or a headset with hands-free off), or
 * one the system has muted.
 */
export function MicCheck({ className = "" }: { className?: string }) {
  const s = useSoftphone();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MicTestResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      setResult(await softphone.testMic());
    } finally {
      setRunning(false);
    }
  };

  const name = result?.label ? `"${result.label}"` : "your microphone";
  let verdict: React.ReactNode = null;
  if (result?.error) verdict = <span className="text-red-700">{result.error}</span>;
  else if (result?.heard) verdict = <span className="text-green-700">We heard you — {name} is working.</span>;
  else if (result?.osMuted) verdict = <span className="text-amber-800">{name} isn&apos;t producing any audio — the system may have it muted, or another app is using it.</span>;
  else if (result) verdict = <span className="text-amber-800">Nothing came through from {name}. Check its mute switch, or pick another microphone.</span>;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <Mic size={12} className="shrink-0 text-gray-400" />
        <span>Microphone</span>
        {running ? (
          <>
            <MicMeter />
            <span className="text-gray-500">Say something…</span>
          </>
        ) : (
          <button type="button" onClick={() => void run()} disabled={!!s.call} className="font-medium text-gray-800 underline-offset-2 hover:underline disabled:opacity-50">
            Test it
          </button>
        )}
      </div>
      <MicPicker className="mt-1.5 sm:max-w-xs" />
      {verdict && <p className="mt-1 text-xs">{verdict}</p>}
      {!running && !result && s.micWarning && (
        <p className="mt-1 text-xs text-amber-800" role="alert">
          {s.micWarning}
        </p>
      )}
    </div>
  );
}
