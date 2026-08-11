"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";

/**
 * The send ritual — same overlay language as ChargeOverlay: the paper plane
 * sweeps across a glass overlay, then the green check draws itself over
 * "Emailed to …". Always shows: with prefers-reduced-motion the flight is
 * skipped and the confirmation appears directly (never nothing — the old
 * body-appended plane returned early there, which read as "no animation").
 * Self-timed; the caller only clears `to` in onDone.
 */
export default function SendOverlay({
  to,
  onDone,
}: {
  /** Email address just sent to — null hides the overlay. */
  to: string | null;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"fly" | "sent">("fly");

  useEffect(() => {
    if (to == null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(reduced ? "sent" : "fly");
    const toSent = reduced ? null : setTimeout(() => setPhase("sent"), 850);
    const finish = setTimeout(onDone, reduced ? 1400 : 2300);
    return () => {
      if (toSent) clearTimeout(toSent);
      clearTimeout(finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  if (to == null) return null;

  return (
    <div className="charge-overlay fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm px-6">
      <div className="w-full max-w-xs text-center">
        {phase === "fly" ? (
          <>
            <div className="relative mx-auto h-24 w-24">
              <Send
                size={34}
                className="send-fly absolute left-1/2 top-1/2 -ml-[17px] -mt-[17px] text-green-600"
              />
            </div>
            <p className="mt-5 text-sm text-gray-500">Sending…</p>
          </>
        ) : (
          <>
            <div className="charge-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-600">
              <svg viewBox="0 0 48 48" className="h-12 w-12">
                <path
                  className="charge-draw"
                  d="M12 25 L21 34 L37 16"
                  fill="none"
                  stroke="white"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="mt-5 text-lg font-bold text-gray-900">On its way</p>
            <p className="mt-1 text-sm text-gray-600 break-all">Emailed to {to}</p>
          </>
        )}
      </div>
    </div>
  );
}
