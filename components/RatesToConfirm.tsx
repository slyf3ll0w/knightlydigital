"use client";

import { Check } from "lucide-react";
import { APP_THEME } from "@/components/EstimatorControls";

/**
 * The rates Atlas had to guess while building a tool, as a plain checklist
 * the owner ticks off once each is set — the same quiet card the rest of the
 * app uses for "things to do", not an alert. `onDone` removes a line; omit
 * it for a read-only list (the build's finish card).
 */
export default function RatesToConfirm({ items, onDone, onOpenPricing, compact = false }: { items: string[]; onDone?: (index: number) => void; onOpenPricing?: () => void; compact?: boolean }) {
  if (items.length === 0) return null;
  const theme = APP_THEME;
  return (
    <div className={compact ? "rounded-xl border border-gray-200" : "card-ledger overflow-hidden"}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Rates to confirm</p>
          <p className="mt-0.5 text-xs text-gray-500">Atlas used a typical number where you didn&apos;t give one. Set yours, then tick it off.</p>
        </div>
        {onOpenPricing && (
          <button type="button" onClick={onOpenPricing} className="shrink-0 text-xs font-medium text-gray-700 underline-offset-2 hover:underline">
            Open pricing
          </button>
        )}
      </div>
      <ul className="divide-y divide-gray-100 border-t border-gray-100">
        {items.map((p, i) => (
          <li key={`${p}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            {onDone ? (
              <button type="button" onClick={() => onDone(i)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300 text-transparent hover:text-gray-400" style={{ borderColor: undefined }} aria-label="Mark as set" title="Mark as set">
                <Check size={12} strokeWidth={3} />
              </button>
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: theme.accent }} aria-hidden />
            )}
            <span className="min-w-0 flex-1 text-sm text-gray-800">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
