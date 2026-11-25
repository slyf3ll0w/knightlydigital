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
 * 2026-11-25: redrawn as the Reports page in the open look.
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

/** OpenSection (components/ds): the bold title on the two-color bar, then the body. */
function Sec({
  title,
  aside,
  children,
  className = "",
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bb-sec min-w-0 ${className}`}>
      <div className="bb-sec-head">
        <h2 className="bb-h2">
          <span className="bb-h2-text">{title}</span>
        </h2>
        {aside && <div className="bb-sec-aside">{aside}</div>}
      </div>
      <div className="bb-sec-body">{children}</div>
    </section>
  );
}

/** A hairline row: label (and its hint) on the left, the figure on the right. */
function Line({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-[color:var(--ds-line)] py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${strong ? "text-[15px] font-semibold text-[color:var(--ds-ink)]" : "text-[14px] text-[color:var(--ds-ink-2)]"}`}>{label}</span>
        {hint && <span className="block truncate text-[12.5px] text-[color:var(--ds-muted)]">{hint}</span>}
      </span>
      <span className={`ds-num shrink-0 ${strong ? "text-[17px] font-bold text-[color:var(--ds-good)]" : "text-[14.5px] font-semibold text-[color:var(--ds-ink)]"}`}>{value}</span>
    </div>
  );
}

/**
 * Reports (app/platform/business, one page with tabs since 2026-11-21) on
 * the open page: the header with its context line, the tabs, then the
 * money, lead sources, a job's margin and the monthly repeats as open
 * sections — white page, hairlines, the two-color bar.
 */
export default function WBInsights() {
  const profit = JOB.revenue - JOB.cost - JOB.labor;
  const margin = Math.round((profit / JOB.revenue) * 100);
  return (
    <div
      className="app-ui ds select-none overflow-hidden rounded-xl bg-[color:var(--ds-surface)] p-6 text-left shadow-[0_0_0_1px_rgba(10,20,40,0.1),0_30px_60px_-30px_rgba(10,20,40,0.5)] sm:p-8"
      style={APP_VARS}
      aria-hidden
      inert
    >
      <div className="ds-pagehead mb-5">
        <p className="ds-eyebrow ds-eyebrow-plain">Nov 1 – Nov 25 · profit is up on last month</p>
        <h1 className="ds-title mt-1" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>
          Reports
        </h1>
      </div>
      <div className="mb-8 flex items-center gap-6 overflow-hidden border-b border-[color:var(--ds-line-strong)]">
        {["Insights", "Timesheets", "Expenses", "Team map"].map((t, i) => (
          <span key={t} className={`relative shrink-0 pb-2.5 text-[14px] ${i === 0 ? "font-semibold text-[color:var(--ds-ink)]" : "font-medium text-[color:var(--ds-muted)]"}`}>
            {t}
            {i === 0 && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[color:var(--ds-primary)]" />}
          </span>
        ))}
      </div>
      <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
        <Sec title="Money">
          <div className="pt-3">
            <span className="bb-label block">Profit this period</span>
            <span className="bb-big ds-num mt-1 block">{usd(COLLECTED - SPENT)}</span>
          </div>
          <div className="mt-3">
            <Line label="Collected revenue" hint="41 payments in this period" value={usd(COLLECTED)} />
            <Line label="Expenses" hint="23 logged" value={`−${usd(SPENT)}`} />
          </div>
        </Sec>
        <Sec
          title={
            <span className="inline-flex items-center gap-1.5">
              By lead source
              <InfoDot />
            </span>
          }
          aside={<span className="ds-link text-[13px] font-medium">Lead sources</span>}
        >
          <div className="space-y-3.5 pt-4">
            {SOURCES.map(([key, revenue]) => {
              const pct = Math.round((revenue / COLLECTED) * 100);
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--ds-ink)]">{key}</span>
                    <span className="ds-num shrink-0 font-semibold text-[color:var(--ds-ink)]">
                      {usd(revenue)}
                      <span className="ml-1.5 text-[12px] font-normal text-[color:var(--ds-muted)]">{pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-line)]">
                    <div className="h-full rounded-full bg-[color:var(--ds-primary)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Sec>
        <Sec title="A job's margin" aside={<span className="text-[13px] text-[color:var(--ds-muted)]">Sub-panel for workshop</span>}>
          <div className="pt-1">
            <Line label="Revenue" value={usd(JOB.revenue)} />
            <Line label="Line item cost" value={`−${usd(JOB.cost)}`} />
            <Line label="Labor (6h)" value={`−${usd(JOB.labor)}`} />
            <Line label={`Profit · ${margin}%`} value={usd(profit)} strong />
          </div>
        </Sec>
        <Sec
          title={
            <span className="inline-flex items-center gap-1.5">
              <Repeat size={15} className="text-[color:var(--ds-muted)]" />
              Repeats monthly
            </span>
          }
        >
          <div className="pt-1">
            {RECURRING.map(([what, amount, cat]) => (
              <div key={what} className="flex items-center gap-3 border-b border-[color:var(--ds-line)] py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[color:var(--ds-ink)]">{what}</p>
                  <p className="text-[12.5px] text-[color:var(--ds-muted)]">Logs on the 1st · next Dec 1 · {cat}</p>
                </div>
                <span className="ds-num shrink-0 text-[14px] font-semibold text-[color:var(--ds-ink)]">{usd(amount)}/mo</span>
                <span className="flex shrink-0 items-center gap-0.5 text-[color:var(--ds-faint)]">
                  <span className="rounded-full p-1.5"><Pause size={13} /></span>
                  <span className="rounded-full p-1.5"><Trash2 size={13} /></span>
                </span>
              </div>
            ))}
          </div>
        </Sec>
      </div>
    </div>
  );
}
