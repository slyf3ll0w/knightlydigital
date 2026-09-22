"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Phone, PhoneCall } from "lucide-react";
import { softphone, softphoneIdle, useSoftphone } from "@/lib/softphone-client";

/**
 * The Calls page dialer: type a number, call it from the business line in
 * this browser (lib/softphone.ts). Also the one place that says out loud
 * whether calls ring here — connected, connecting, off with the reason —
 * so an owner can tell at a glance why their laptop did or didn't ring.
 */
export default function DialFromApp({ manager }: { manager: boolean }) {
  const s = useSoftphone();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (s.status === "off") {
    const why =
      s.reason === "disabled"
        ? "Calls ring on your cell only — turn on “Calls in the app” under My Profile to take them here."
        : s.reason === "native"
          ? "In the app, calls ring on your phone. Open WorkBench on a computer to take them in the browser."
          : s.reason === "unsupported"
            ? "This browser can't take calls (no microphone / WebRTC support)."
            : null;
    if (!why) return null;
    return (
      <p className="mt-3 text-xs text-gray-500">
        {why}
        {s.reason === "disabled" && (
          <>
            {" "}
            <Link href="/app/settings/profile" className="underline">
              My Profile
            </Link>
          </>
        )}
      </p>
    );
  }

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

  const ready = softphoneIdle(s);
  return (
    <div className="card-ledger px-4 py-3 mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.status === "ready" ? "text-green-700" : s.status === "error" ? "text-amber-700" : "text-gray-500"}`}>
          <span className={`w-2 h-2 rounded-full ${s.status === "ready" ? "bg-green-500" : s.status === "error" ? "bg-amber-500" : "bg-gray-300 animate-pulse"}`} />
          {s.status === "ready"
            ? s.call
              ? "On a call"
              : "Ringing here when a client calls"
            : s.status === "error"
              ? "Softphone reconnecting…"
              : "Connecting softphone…"}
        </span>
        <form
          className="ml-auto flex items-center gap-2"
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
            placeholder="(214) 555-0100"
            aria-label="Number to call"
            disabled={!ready}
            className="w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!ready || busy || !to.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />}
            Call
          </button>
        </form>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      {s.status === "ready" && !s.call && (
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <Phone size={11} /> Calls from here show your business number. Nobody answers in a browser within 15 seconds → the cell rings
          {manager ? " (the ring-through number in Settings → Features)" : ""}.
        </p>
      )}
    </div>
  );
}
