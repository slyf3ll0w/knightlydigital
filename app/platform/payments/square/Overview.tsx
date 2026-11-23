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

  // Round 8 (2026-11-23 — the boxes-with-arrows band read as AI-made): one
  // card, Stripe-style. The figure and its change over the chart on the left;
  // on the right a typeset ledger (gross − refunds − fees = net) and what is
  // on its way to the bank.
  const cents = (n: number) => money(n / 100);
  return (
    <section className="ds-card ds-card-raised ds-pay mb-6">
      <div className="ds-pay-main">
        <header className="ds-pay-head">
          <div className="min-w-0">
            <p className="ds-pay-label">
              <span>Gross volume</span>
              <span className="ds-pic-quiet"> · {rangeLabel.toLowerCase()}</span>
            </p>
            <p className="ds-pay-fig">{cents(t.gross)}</p>
            <p className="ds-pay-sub">
              {change != null && (
                <span className={`ds-stat-change ${change >= 0 ? "is-up" : "is-down"}`}>
                  {change >= 0 ? <ArrowUpRight size={13} strokeWidth={2.6} /> : <ArrowDownRight size={13} strokeWidth={2.6} />}
                  {Math.abs(change * 100).toFixed(change !== 0 && Math.abs(change) < 0.1 ? 1 : 0)}%
                </span>
              )}
              <span>
                {t.count} {t.count === 1 ? "payment" : "payments"} · {cents(p.gross)} the period before
              </span>
            </p>
          </div>
          <nav aria-label="Range" className="ds-stat-range">
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
        </header>
        <div className="mt-4">
          <VolumeChart points={points} />
        </div>
        <p className="ds-pay-key">
          <span>
            <i className="is-cur" /> {rangeLabel}
          </span>
          <span>
            <i className="is-prev" /> Period before
          </span>
        </p>
      </div>

      <aside className="ds-pay-side">
        <table className="ds-pay-ledger">
          <caption className="sr-only">Where the money went, {rangeLabel.toLowerCase()}</caption>
          <tbody>
            <tr>
              <th scope="row">Gross</th>
              <td>{cents(t.gross)}</td>
            </tr>
            <tr>
              <th scope="row">Refunds</th>
              <td>{t.refunds > 0 ? `− ${cents(t.refunds)}` : "—"}</td>
            </tr>
            <tr>
              <th scope="row">Processing fees</th>
              <td>{t.fees > 0 ? `− ${cents(t.fees)}` : "—"}</td>
            </tr>
            <tr className="is-total">
              <th scope="row">Net volume</th>
              <td>{cents(net)}</td>
            </tr>
          </tbody>
        </table>
        <Link prefetch={false} href="/app/payments?tab=payouts" className="ds-pay-way">
          <span className="ds-pay-way-label">On its way to your bank</span>
          <span className="ds-pay-way-fig">{onTheWayCents == null ? "—" : cents(onTheWayCents)}</span>
          <span className="ds-pay-way-note">{payoutsNote}</span>
        </Link>
        {openDisputes ? (
          <Link prefetch={false} href="/app/payments?tab=disputes" className="ds-pic-alert ds-pay-alert">
            {openDisputes} open {openDisputes === 1 ? "dispute" : "disputes"} · answer before the deadline
          </Link>
        ) : null}
      </aside>
    </section>
  );
}
