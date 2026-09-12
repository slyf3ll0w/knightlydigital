"use client";

import { useEffect, useState } from "react";

/** A price-book item as the chips need it (shape of GET /api/app/work-items). */
export type ServiceLite = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number | string;
  unitCost?: number | string | null;
  durationMinutes: number | null;
  recurringInterval: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null;
};

const INTERVAL_SHORT: Record<string, string> = { MONTHLY: "/mo", QUARTERLY: "/qtr", SEMIANNUAL: "/6mo", ANNUAL: "/yr" };

function fmtPrice(v: number | string): string {
  const n = Number(v) || 0;
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

/**
 * Tap-to-pick chips over the company's price book — the click-first way to
 * say what a job / request / series is for, so nobody has to type a title
 * that's already saved as a service. Renders nothing when the price book is
 * empty. Pass `items` to skip the fetch (server-loaded pages).
 */
export default function ServiceChips({
  items,
  selectedIds,
  onToggle,
  label = "Service",
  className = "",
}: {
  items?: ServiceLite[] | null;
  selectedIds: string[];
  onToggle: (item: ServiceLite) => void;
  label?: string | null;
  className?: string;
}) {
  const [fetched, setFetched] = useState<ServiceLite[] | null>(null);

  useEffect(() => {
    if (items !== undefined) return;
    let cancelled = false;
    fetch("/api/app/work-items")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ServiceLite[]) => {
        if (!cancelled) setFetched(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setFetched([]);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const list = items ?? fetched ?? [];
  if (list.length === 0) return null;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>}
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {list.map((w) => {
          const on = selectedIds.includes(w.id);
          const price = Number(w.unitPrice) || 0;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onToggle(w)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {w.name}
              {price > 0 && (
                <span className={`ml-1 ${on ? "text-green-700/80" : "text-gray-400"}`}>
                  ${fmtPrice(price)}
                  {w.recurringInterval ? INTERVAL_SHORT[w.recurringInterval] : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
