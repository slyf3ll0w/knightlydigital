"use client";

import { useState } from "react";
import { Headphones, Loader2, PhoneOff } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";

/**
 * My Profile → "Calls in the app": whether business-line calls ring in this
 * person's browser while they're signed in on a computer
 * (User.softphoneEnabled, lib/softphone.ts). Off = their cell only. Only
 * rendered when the company's line is on the voice app.
 */
export default function SoftphoneToggleCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ softphoneEnabled: !on }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't save.");
      setOn(!on);
      // Turning it on: ask for the microphone now, while the person is
      // looking at this card, so the first call is not the first prompt.
      if (!on && navigator.mediaDevices?.getUserMedia) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          s.getTracks().forEach((t) => t.stop());
        } catch {
          setError("Calls are on, but the microphone was refused — allow it for this site (on the phone: Settings → WorkBench → Microphone) before your first call.");
        }
      }
      // The softphone in this tab registers on the next page load; say so.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-ledger p-5 mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <SectionHeader
            title="Calls in the app"
            hint={
              on
                ? "Business-line calls ring in your browser while you're signed in on a computer, and calls you place from a client's page go out from here. Your cell rings when nobody picks up within 15 seconds."
                : "Business-line calls ring on your cell only. Turn this on to answer and place them from your browser."
            }
          />
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-50 shrink-0 ${
            on ? "border border-gray-300 text-gray-700 hover:bg-gray-50" : "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white"
          }`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : on ? <PhoneOff size={13} /> : <Headphones size={13} />}
          {on ? "Turn off" : "Turn on"}
        </button>
      </div>
      {on !== initial && <p className="mt-2 text-xs text-gray-500">Takes effect the next time a page loads.</p>}
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
