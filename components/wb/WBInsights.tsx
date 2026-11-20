"use client";

import { Pause, Repeat, Trash2 } from "lucide-react";
import { APP_VARS, InfoDot, usd } from "@/components/wb/WBAppJourney";

/**
 * "Know which jobs make you money" (home). Copies of the REAL screens where
 * WorkBench adds it up as you work, drawn with the app's own classes
 * (.app-ui + .ds, ds-card) in Brightwire Electric's colors (2026-11-20
 * fidelity pass):
 *   - Insights (app/platform/insights/page.tsx): the money summary (the
 *     page's ledger card: Collected revenue, Expenses, Profit) and the "By
 *     lead source" card,
 *   - a job's Profit margin card (app/platform/jobs/[id]/page.tsx),
 *   - Expenses → Repeats monthly (app/platform/expenses/ExpensesClient.tsx).
 * Static, as the app draws them (the app does not animate these).
 */

const COLLECTED = 18420;
const SPENT = 6240;
const SOURCES: [string, number][] = [
  ["Google Ads", 8900],
  ["Referral", 5120],
  ["Website estimate", 2210],
  ["Online booking", 1490],
  ["Facebook", 700],
];
// The Olsen sub-panel job.
const JOB = { revenue: 2316, cost: 580, laborMs: 6 * 3600000, labor: 690 };
const RECURRING: [string, number, string][] = [
  ["Shop rent", 1200, "Rent"],
  ["Van payment", 940, "Vehicle"],
  ["Liability insurance", 268, "Insurance"],
];

/** One line of the Insights ledger card (LedgerLine in the page). */
function Ledger({
  label,
  hint,
  value,
  strong,
}: {
  label: string;
  hint?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate ${strong ? "text-[15px] font-semibold text-gray-900" : "text-sm text-gray-600"}`}
        >
          {label}
        </span>
        {hint && (
          <span className="block truncate text-[11px] text-gray-400">
            {hint}
          </span>
        )}
      </span>
      <span
        className={`numeral-ledger shrink-0 tabular-nums ${strong ? "text-xl font-bold text-[color:var(--ds-good)]" : "text-[15px] font-semibold text-gray-900"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`ds-card ${className}`}>{children}</div>;
}

export default function WBInsights() {
  const profit = JOB.revenue - JOB.cost - JOB.labor;
  return (
    <div
      className="app-ui ds grid select-none gap-4 text-left sm:grid-cols-2"
      style={APP_VARS}
      aria-hidden
      inert
    >
      {/* Insights: the money summary (the page's ledger card at this width) */}
      <Card className="divide-y divide-[color:var(--ds-line)] sm:col-span-2">
        <Ledger
          label="Collected revenue"
          hint="41 payments in this period"
          value={usd(COLLECTED)}
        />
        <Ledger
          label="Expenses"
          hint="23 logged — manage"
          value={`−${usd(SPENT)}`}
        />
        <Ledger label="Profit" value={usd(COLLECTED - SPENT)} strong />
      </Card>

      {/* Insights: By lead source */}
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-line)] px-5 py-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ds-ink)]">
            By lead source
            <InfoDot />
          </h2>
          <span className="shrink-0 text-xs font-semibold text-[color:var(--ds-primary)]">
            Lead sources →
          </span>
        </div>
        <div className="space-y-3 p-5">
          {SOURCES.map(([key, revenue]) => {
            const pct = Math.round((revenue / COLLECTED) * 100);
            return (
              <div key={key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800">
                    {key}
                  </span>
                  <span className="numeral-ledger shrink-0 font-semibold text-gray-900">
                    {usd(revenue)}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      {pct}%
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[color:var(--ds-primary)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* the job page's Profit margin card */}
      <Card className="self-start p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-[14.5px] font-semibold text-[color:var(--ds-ink)]">
          Profit margin
        </h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Revenue</span>
            <span className="text-gray-800">{usd(JOB.revenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Line item cost</span>
            <span className="text-gray-800">−{usd(JOB.cost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Labor (6h)</span>
            <span className="text-gray-800">−{usd(JOB.labor)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-1.5 font-semibold">
            <span className="text-gray-900">Profit</span>
            <span className="text-[color:var(--ds-good)]">
              {usd(profit)} ({Math.round((profit / JOB.revenue) * 100)}%)
            </span>
          </div>
        </div>
      </Card>

      {/* Expenses → Repeats monthly */}
      <Card className="sm:col-span-2">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <Repeat size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">
            Repeats monthly
          </h2>
        </div>
        <div className="divide-y divide-[color:var(--ds-line)]">
          {RECURRING.map(([what, amount, cat]) => (
            <div key={what} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {what}
                </p>
                <p className="text-xs text-gray-500">
                  Logs on the 1st · next Nov 1 · {cat}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-gray-900">
                {usd(amount)}/mo
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <span className="rounded-full p-1.5 text-gray-300">
                  <Pause size={13} />
                </span>
                <span className="rounded-full p-1.5 text-gray-300">
                  <Trash2 size={13} />
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
