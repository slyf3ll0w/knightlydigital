import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { listHref } from "@/components/FilterBar";
import { money } from "@/lib/statuses";
import { startOfDayIn, startOfMonthIn } from "@/lib/timezone";
import type { ReportRow } from "@/lib/payments-reports";
import VolumeChart, { type VolumePoint } from "./VolumeChart";

/**
 * The top of the Square Payments page, Stripe-style (ticket 2026-11-10: "looks
 * more like Square's or Stripe's dashboard"): gross volume for a range with
 * its change against the previous range and a day-by-day chart, then the
 * figures beside it — net, fees, refunds, on its way to the bank, disputes.
 */

export type VolumeRange = "7d" | "30d" | "month" | "90d";
const RANGES: { value: VolumeRange; label: string; short: string }[] = [
  { value: "7d", label: "Last 7 days", short: "7D" },
  { value: "30d", label: "Last 30 days", short: "30D" },
  { value: "month", label: "This month", short: "MTD" },
  { value: "90d", label: "Last 90 days", short: "90D" },
];

export function parseRange(v: string | undefined): VolumeRange {
  return RANGES.some((r) => r.value === v) ? (v as VolumeRange) : "30d";
}

const DAY = 86_400_000;

/** [start, end) of the range and of the one before it, on the company's calendar. */
export function rangeBounds(range: VolumeRange, tz: string, now = new Date()): { start: Date; prevStart: Date; days: number } {
  const today = startOfDayIn(tz, now);
  if (range === "month") {
    const start = startOfMonthIn(tz, now);
    const prevStart = startOfMonthIn(tz, new Date(start.getTime() - DAY));
    const days = Math.round((today.getTime() - start.getTime()) / DAY) + 1;
    return { start, prevStart, days };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  // Noon steps then snap to the zone's midnight, so a DST change can't drift a day.
  const start = startOfDayIn(tz, new Date(today.getTime() - (days - 1) * DAY + DAY / 2));
  const prevStart = startOfDayIn(tz, new Date(start.getTime() - days * DAY + DAY / 2));
  return { start, prevStart, days };
}

type Totals = { gross: number; refunds: number; fees: number; count: number };
const sum = (rows: ReportRow[]): Totals =>
  rows.reduce(
    (t, r) => ({
      gross: t.gross + r.amountCents + r.refundedCents,
      refunds: t.refunds + r.refundedCents,
      fees: t.fees + r.feeCents,
      count: t.count + 1,
    }),
    { gross: 0, refunds: 0, fees: 0, count: 0 }
  );

export default function Overview({
  rows,
  tz,
  range,
  tab,
  onTheWayCents,
  payoutsNote,
  openDisputes,
  disputesNote,
  now = new Date(),
}: {
  /** Report rows from the previous range's start to now. */
  rows: ReportRow[];
  tz: string;
  range: VolumeRange;
  tab: string | undefined;
  onTheWayCents: number | null;
  payoutsNote: string;
  openDisputes: number | null;
  disputesNote: string;
  now?: Date;
}) {
  const { start, prevStart, days } = rangeBounds(range, tz, now);
  const cur = rows.filter((r) => r.paidAt >= start && r.paidAt <= now);
  const prev = rows.filter((r) => r.paidAt >= prevStart && r.paidAt < start);
  const t = sum(cur);
  const p = sum(prev);
  const net = t.gross - t.refunds - t.fees;
  const change = p.gross > 0 ? (t.gross - p.gross) / p.gross : null;

  const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const label = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const k = key.format(r.paidAt);
    byDay.set(k, (byDay.get(k) ?? 0) + (r.amountCents + r.refundedCents) / 100);
  }
  const prevDays = Math.round((start.getTime() - prevStart.getTime()) / DAY);
  const points: VolumePoint[] = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY + DAY / 2);
    const pd = i < prevDays ? new Date(prevStart.getTime() + i * DAY + DAY / 2) : null;
    return {
      label: label.format(d),
      cur: byDay.get(key.format(d)) ?? 0,
      prev: pd ? byDay.get(key.format(pd)) ?? 0 : null,
      prevLabel: pd ? label.format(pd) : null,
    };
  });
  const rangeLabel = RANGES.find((r) => r.value === range)!.label;

  const side = [
    { label: "Net volume", value: money(net / 100), note: "after fees and refunds" },
    { label: "Processing fees", value: t.fees > 0 ? money(t.fees / 100) : "—", note: "kept by Square" },
    { label: "Refunds", value: t.refunds > 0 ? money(t.refunds / 100) : "—", note: t.refunds > 0 ? "given back" : "none" },
  ];

  // Heavy look (2026-11-21): the headline numbers sit on the page's one
  // brand band; the chart and the breakdown are solid cards under it.
  return (
    <>
      <section className="ds-hero ds-rise ds-lb mb-5" style={{ "--ds-i": 1 } as React.CSSProperties}>
        <div className="relative ds-lb-grid">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="ds-lb-label">Gross volume · {rangeLabel.toLowerCase()}</p>
              <nav aria-label="Range" className="ds-lb-range">
                {RANGES.map((r) => (
                  <Link
                    key={r.value}
                    prefetch={false}
                    scroll={false}
                    href={listHref("/app/payments", {}, { tab, range: r.value === "30d" ? undefined : r.value })}
                    aria-current={r.value === range ? "true" : undefined}
                    title={r.label}
                  >
                    {r.short}
                  </Link>
                ))}
              </nav>
            </div>
            <p className="ds-lb-big">{money(t.gross / 100)}</p>
            <p className="ds-lb-note flex flex-wrap items-center gap-x-2 gap-y-1">
              {change != null && (
                <span className={`ds-lb-change ${change >= 0 ? "is-up" : "is-down"}`}>
                  {change >= 0 ? <ArrowUpRight size={13} strokeWidth={2.6} /> : <ArrowDownRight size={13} strokeWidth={2.6} />}
                  {Math.abs(change * 100).toFixed(change !== 0 && Math.abs(change) < 0.1 ? 1 : 0)}%
                </span>
              )}
              <span>
                {t.count} {t.count === 1 ? "payment" : "payments"} · {money(p.gross / 100)} the period before
              </span>
            </p>
          </div>
          <div className="ds-lb-side">
            <p className="ds-lb-label">On its way to your bank</p>
            <Link prefetch={false} href="/app/payments?tab=payouts" className="ds-lb-big">
              {onTheWayCents == null ? "—" : money(onTheWayCents / 100)}
            </Link>
            <p className="ds-lb-note !mt-1">{payoutsNote}</p>
            <div className="mt-2 border-t border-white/15 pt-1">
              <Link prefetch={false} href="/app/payments?tab=disputes" className={`ds-lb-sidelink ${openDisputes ? "is-alert" : ""}`}>
                <span className="min-w-0 truncate">Open disputes</span>
                <span className="ds-lb-sidevalue">{openDisputes == null ? "—" : openDisputes}</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="ds-card ds-card-raised min-w-0 p-4 sm:p-5">
          <h2 className="ds-heavy-h2">Volume by day</h2>
          <div className="mt-4">
            <VolumeChart points={points} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-[color:var(--ds-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-[color:var(--ds-primary)]" /> {rangeLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-[color:var(--ds-muted)]" /> Period before
            </span>
          </p>
        </div>

        <div className="ds-card ds-card-raised grid grid-cols-3 divide-x divide-[color:var(--ds-line)] overflow-hidden lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
          {side.map((x) => (
            <div key={x.label} className="px-4 py-4">
              <p className="text-[12.5px] font-semibold text-[color:var(--ds-muted)]">{x.label}</p>
              <p className="numeral-ledger mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-[color:var(--ds-ink)]">{x.value}</p>
              <p className="text-[12px] text-[color:var(--ds-muted)]">{x.note}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
