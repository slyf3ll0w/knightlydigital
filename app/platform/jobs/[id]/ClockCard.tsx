"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Timer } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import { formatDuration } from "@/lib/time-entries";

type OpenEntry = { id: string; startedAt: string };

/**
 * Clock in / out on this job, with a live elapsed timer. Location is a
 * one-shot stamp captured at the tap (only while clocking — never tracked);
 * a denied/slow GPS never blocks the punch, the stamp is just omitted.
 */
export default function ClockCard({
  jobId,
  openEntry, // my open entry ON THIS JOB (null = not clocked in here)
  openElsewhereTitle, // job title of my open entry on a DIFFERENT job
  loggedMs, // total closed time on this job (all team members)
  othersOnClock, // teammates currently clocked in here
}: {
  jobId: string;
  openEntry: OpenEntry | null;
  openElsewhereTitle: string | null;
  loggedMs: number;
  othersOnClock: string[];
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<OpenEntry | null>(openEntry);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the elapsed label once a second while on the clock
  useEffect(() => {
    if (entry) {
      tickRef.current = setInterval(() => forceTick((n) => n + 1), 1000);
      return () => {
        if (tickRef.current) clearInterval(tickRef.current);
      };
    }
  }, [entry]);

  async function punch(action: "in" | "out") {
    if (busy) return;
    setBusy(true);
    setError(null);
    hapticImpact("MEDIUM");
    const payload: Record<string, unknown> = {
      action,
      clientKey: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    // Best-effort GPS stamp: wait at most 4s, then punch without it
    const gps = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      const timer = setTimeout(() => resolve(null), 4000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve(pos);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 }
      );
    });
    if (gps) {
      payload.lat = gps.coords.latitude;
      payload.lng = gps.coords.longitude;
      payload.accuracy = gps.coords.accuracy;
    }
    try {
      const res = await fetch(`/api/app/jobs/${jobId}/clock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't reach the server — try again.");
      } else {
        setEntry(
          action === "in" && data.entry
            ? { id: data.entry.id, startedAt: data.entry.startedAt }
            : null
        );
        router.refresh(); // pull in the activity note + new totals
      }
    } catch {
      setError("You're offline — reconnect and try again.");
    } finally {
      setBusy(false);
    }
  }

  const elapsed = entry ? Date.now() - new Date(entry.startedAt).getTime() : 0;

  return (
    <div className="card-ledger p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Time clock
        </h2>
        {loggedMs > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Timer size={12} />
            {formatDuration(loggedMs)} logged
          </span>
        )}
      </div>

      {entry ? (
        <>
          <p className="numeral-ledger text-2xl font-semibold text-gray-900 tabular-nums mb-3">
            {formatDuration(elapsed)}
          </p>
          <button
            onClick={() => punch("out")}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 active:scale-[0.98] transition disabled:opacity-50"
          >
            <Square size={14} fill="currentColor" />
            Clock Out
          </button>
        </>
      ) : (
        <>
          {openElsewhereTitle && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              You&apos;re still clocked in on &ldquo;{openElsewhereTitle}&rdquo; — clocking in
              here will clock you out there.
            </p>
          )}
          <button
            onClick={() => punch("in")}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 active:scale-[0.98] transition disabled:opacity-50"
          >
            <Play size={14} fill="currentColor" />
            Clock In
          </button>
        </>
      )}

      {othersOnClock.length > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          On the clock: {othersOnClock.join(", ")}
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
