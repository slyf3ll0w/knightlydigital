"use client";

import { CreditCard } from "lucide-react";

/**
 * The card-terminal ritual for saved-card charges: a full-screen glass
 * overlay that shows the card being contacted, then the approved checkmark
 * drawing itself (or a declined shake). Purely presentational — the caller
 * owns the phase and dismissal timing.
 */

export type ChargePhase =
  | { state: "processing"; label: string; amount: number }
  | { state: "approved"; label: string; amount: number }
  | { state: "declined"; label: string; amount: number; error: string };

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ChargeOverlay({
  phase,
  onDismiss,
}: {
  phase: ChargePhase | null;
  onDismiss: () => void;
}) {
  if (!phase) return null;

  return (
    <div className="charge-overlay fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm px-6">
      <div className="w-full max-w-xs text-center">
        {phase.state === "processing" && (
          <>
            <div className="relative mx-auto h-24 w-24">
              {/* Spinner ring around the card — the "contacting the network" beat */}
              <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full animate-spin [animation-duration:1.1s]">
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="#111827"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="80 200"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <CreditCard size={30} className="charge-card-pulse text-gray-700" />
              </div>
            </div>
            <p className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
              {money(phase.amount)}
            </p>
            <p className="mt-1 text-sm text-gray-600">Charging {phase.label}</p>
            <p className="mt-3 text-xs text-gray-400">Contacting the card network…</p>
          </>
        )}

        {phase.state === "approved" && (
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
            <p className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
              {money(phase.amount)}
            </p>
            <p className="mt-1 text-sm font-semibold text-green-700">Approved</p>
            <p className="mt-1 text-xs text-gray-400">{phase.label}</p>
          </>
        )}

        {phase.state === "declined" && (
          <>
            <div className="charge-shake mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-50 border-2 border-red-200">
              <svg viewBox="0 0 48 48" className="h-11 w-11">
                <path
                  d="M16 16 L32 32 M32 16 L16 32"
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="mt-5 text-sm font-semibold text-red-700">Card declined</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{phase.error}</p>
            <button
              onClick={onDismiss}
              className="mt-5 rounded-[10px] border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
