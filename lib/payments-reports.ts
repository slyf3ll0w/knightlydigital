import { csvCell, csvText } from "@/lib/csv";
import { startOfDayIn, startOfMonthIn, startOfWeekIn, zonedMidnight, zonedParts } from "@/lib/timezone";

/**
 * Pure helpers behind the Reports tab on /app/payments (2026-10-28): money
 * in by day / week / month in the COMPANY's timezone, split by tech and by
 * job type, and the CSV. Rows come from two places and read the same here —
 * our Payment rows (any method; a processor row carries its fee) and Square
 * payments the seller took outside WorkBench (POS, Square Online). Nothing
 * here touches the database; `npx tsx scripts/test-payments-reports.ts`.
 *
 * Money is in CENTS. "Collected" is the original charge (a refunded Payment's
 * `amount` is decremented in place, so collected = amount + Σrefunds),
 * "refunds" what went back, "fees" the processor's cut, and
 * net = collected − refunds − fees.
 */

export type ReportPeriod = "day" | "week" | "month";
export const REPORT_PERIODS: readonly ReportPeriod[] = ["day", "week", "month"];
/** How many periods the tab shows (and the CSV carries). */
export const REPORT_PERIOD_COUNT = 12;

export function isReportPeriod(v: unknown): v is ReportPeriod {
  return v === "day" || v === "week" || v === "month";
}

export type ReportRow = {
  id: string;
  paidAt: Date;
  /** The row's current amount (after refunds), cents. */
  amountCents: number;
  /** What was refunded off it, cents. */
  refundedCents: number;
  /** Processing fee, cents (0 for cash / check / unknown). */
  feeCents: number;
  method: "CARD" | "ACH" | "OTHER";
  /** Where it was taken. */
  source: "workbench" | "square";
  /** People on the job the invoice billed (display names); [] = nobody / no job. */
  techs: readonly string[];
  /** The kind of work — price-book service names on the job, else its title; null = no job. */
  jobType: string | null;
};

export type ReportTotals = {
  count: number;
  collectedCents: number;
  refundsCents: number;
  feesCents: number;
  netCents: number;
};

export type PeriodTotals = ReportTotals & {
  /** Stable key: YYYY-MM-DD of the period's first day (week = Sunday), YYYY-MM for months. */
  key: string;
  /** First instant of the period (company zone). */
  start: Date;
  /** First instant of the next period. */
  end: Date;
  /** "Oct 28", "Oct 26 – Nov 1", "October 2026". */
  label: string;
};

export type Breakdown = ReportTotals & { name: string };

export type PaymentsReport = {
  period: ReportPeriod;
  tz: string;
  /** Oldest first. */
  periods: PeriodTotals[];
  /** Range covered: periods[0].start … periods[last].end. */
  from: Date;
  to: Date;
  totals: ReportTotals;
  byTech: Breakdown[];
  byJobType: Breakdown[];
};

const UNASSIGNED = "Unassigned";
const NO_JOB = "No job";

export function emptyTotals(): ReportTotals {
  return { count: 0, collectedCents: 0, refundsCents: 0, feesCents: 0, netCents: 0 };
}

function add(t: ReportTotals, row: ReportRow, share = 1): void {
  const collected = Math.round((row.amountCents + row.refundedCents) * share);
  const refunds = Math.round(row.refundedCents * share);
  const fees = Math.round(row.feeCents * share);
  t.count += share === 1 ? 1 : share;
  t.collectedCents += collected;
  t.refundsCents += refunds;
  t.feesCents += fees;
  t.netCents += collected - refunds - fees;
}

function finish(t: ReportTotals): ReportTotals {
  // Shares make `count` fractional; a report counts payments, not fractions.
  return { ...t, count: Math.round(t.count * 1000) / 1000 };
}

export function summarize(rows: readonly ReportRow[]): ReportTotals {
  const t = emptyTotals();
  for (const r of rows) add(t, r);
  return finish(t);
}

// ─── Periods ────────────────────────────────────────────────────────────────

/** First instant of the period `date` falls in, in `tz`. */
export function periodStart(tz: string, date: Date, period: ReportPeriod): Date {
  if (period === "day") return startOfDayIn(tz, date);
  if (period === "week") return startOfWeekIn(tz, date);
  return startOfMonthIn(tz, date);
}

/** First instant of the period after the one starting at `start`. */
export function nextPeriodStart(tz: string, start: Date, period: ReportPeriod): Date {
  const p = zonedParts(tz, start);
  if (period === "day") return zonedMidnight(tz, p.y, p.m, p.d + 1);
  if (period === "week") return zonedMidnight(tz, p.y, p.m, p.d + 7);
  return zonedMidnight(tz, p.y, p.m + 1, 1);
}

/** Period `n` steps before the one starting at `start` (n ≥ 1). */
export function previousPeriodStart(tz: string, start: Date, period: ReportPeriod, n = 1): Date {
  const p = zonedParts(tz, start);
  if (period === "day") return zonedMidnight(tz, p.y, p.m, p.d - n);
  if (period === "week") return zonedMidnight(tz, p.y, p.m, p.d - 7 * n);
  return zonedMidnight(tz, p.y, p.m - n, 1);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function periodKey(tz: string, start: Date, period: ReportPeriod): string {
  const p = zonedParts(tz, start);
  return period === "month" ? `${p.y}-${pad(p.m)}` : `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function periodLabel(tz: string, start: Date, period: ReportPeriod, now = new Date()): string {
  const p = zonedParts(tz, start);
  const thisYear = zonedParts(tz, now).y === p.y;
  const year = thisYear ? "" : `, ${p.y}`;
  if (period === "month") return `${MONTHS_LONG[p.m - 1]} ${p.y}`;
  if (period === "day") return `${MONTHS[p.m - 1]} ${p.d}${year}`;
  const e = zonedParts(tz, zonedMidnight(tz, p.y, p.m, p.d + 6));
  const endLabel = e.m === p.m ? `${e.d}` : `${MONTHS[e.m - 1]} ${e.d}`;
  return `${MONTHS[p.m - 1]} ${p.d} – ${endLabel}${year}`;
}

/**
 * The last `count` periods ending with the one containing `now` (or the one
 * containing `anchor`, when the picker moved back in time). Oldest first.
 */
export function lastPeriods(
  tz: string,
  period: ReportPeriod,
  count = REPORT_PERIOD_COUNT,
  anchor: Date = new Date()
): { key: string; start: Date; end: Date; label: string }[] {
  const latest = periodStart(tz, anchor, period);
  const out: { key: string; start: Date; end: Date; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = i === 0 ? latest : previousPeriodStart(tz, latest, period, i);
    out.push({ key: periodKey(tz, start, period), start, end: nextPeriodStart(tz, start, period), label: periodLabel(tz, start, period) });
  }
  return out;
}

/** Bucket rows into the given periods (rows outside every period are dropped). */
export function groupByPeriod(
  rows: readonly ReportRow[],
  periods: readonly { key: string; start: Date; end: Date; label: string }[]
): PeriodTotals[] {
  const buckets = periods.map((p) => ({ ...p, ...emptyTotals() }));
  for (const r of rows) {
    const ms = r.paidAt.getTime();
    const b = buckets.find((p) => ms >= p.start.getTime() && ms < p.end.getTime());
    if (b) add(b, r);
  }
  return buckets.map((b) => ({ ...b, ...finish(b) }));
}

// ─── Breakdowns ─────────────────────────────────────────────────────────────

/**
 * By tech: a payment on a job with several people is split evenly between
 * them (so the column adds up to the total); no job / nobody assigned =
 * "Unassigned". Sorted by collected, descending.
 */
export function breakdownByTech(rows: readonly ReportRow[]): Breakdown[] {
  const map = new Map<string, ReportTotals>();
  for (const r of rows) {
    const names = r.techs.length ? Array.from(new Set(r.techs)) : [UNASSIGNED];
    const share = 1 / names.length;
    for (const n of names) {
      const t = map.get(n) ?? emptyTotals();
      add(t, r, share);
      map.set(n, t);
    }
  }
  return sortBreakdown(map);
}

/** By job type: the row's `jobType`, "No job" when the invoice had none. */
export function breakdownByJobType(rows: readonly ReportRow[]): Breakdown[] {
  const map = new Map<string, ReportTotals>();
  for (const r of rows) {
    const name = r.jobType?.trim() || NO_JOB;
    const t = map.get(name) ?? emptyTotals();
    add(t, r);
    map.set(name, t);
  }
  return sortBreakdown(map);
}

function sortBreakdown(map: Map<string, ReportTotals>): Breakdown[] {
  return Array.from(map.entries())
    .map(([name, t]) => ({ name, ...finish(t) }))
    .sort((a, b) => b.collectedCents - a.collectedCents || a.name.localeCompare(b.name));
}

/**
 * "Job type" for a row: the price-book service names on the job (deduped,
 * joined with " + "), else the job's title, else null. Mirrors
 * lib/job-crew deriveJobTitle's order so the report says what the job list says.
 */
export function jobTypeOf(job: { title: string; lineItems?: readonly { name: string; workItemId: string | null }[] } | null | undefined): string | null {
  if (!job) return null;
  const services = Array.from(new Set((job.lineItems ?? []).filter((l) => l.workItemId).map((l) => l.name.trim()).filter(Boolean)));
  if (services.length) return services.slice(0, 3).join(" + ");
  return job.title.trim() || null;
}

// ─── The report ─────────────────────────────────────────────────────────────

export function buildPaymentsReport(
  rows: readonly ReportRow[],
  opts: { tz: string; period: ReportPeriod; anchor?: Date; count?: number }
): PaymentsReport {
  const periods = lastPeriods(opts.tz, opts.period, opts.count ?? REPORT_PERIOD_COUNT, opts.anchor);
  const from = periods[0].start;
  const to = periods[periods.length - 1].end;
  const inRange = rows.filter((r) => r.paidAt.getTime() >= from.getTime() && r.paidAt.getTime() < to.getTime());
  return {
    period: opts.period,
    tz: opts.tz,
    periods: groupByPeriod(inRange, periods),
    from,
    to,
    totals: summarize(inRange),
    byTech: breakdownByTech(inRange),
    byJobType: breakdownByJobType(inRange),
  };
}

// ─── CSV ────────────────────────────────────────────────────────────────────

const dollars = (c: number) => (c / 100).toFixed(2);

/**
 * One CSV with three blocks: the periods, then by tech, then by job type.
 * Names (techs, job types) are user-typed → csvText; amounts are numbers.
 */
export function reportCsv(report: PaymentsReport): string {
  const periodWord = report.period === "day" ? "Day" : report.period === "week" ? "Week of" : "Month";
  const lines: string[] = [];
  const header = (first: string) => [first, "Payments", "Collected", "Refunds", "Fees", "Net"].map(csvCell).join(",");
  const totalsRow = (name: string, t: ReportTotals) =>
    [csvText(name), String(t.count), dollars(t.collectedCents), dollars(t.refundsCents), dollars(t.feesCents), dollars(t.netCents)].join(",");

  lines.push(header(periodWord));
  for (const p of report.periods) lines.push(totalsRow(p.label, p));
  lines.push(totalsRow("Total", report.totals));
  lines.push("");
  lines.push(header("Tech"));
  for (const b of report.byTech) lines.push(totalsRow(b.name, b));
  lines.push("");
  lines.push(header("Job type"));
  for (const b of report.byJobType) lines.push(totalsRow(b.name, b));
  return lines.join("\n");
}

/** `payments-report-week-2026-10-26.csv` */
export function reportCsvFilename(report: PaymentsReport): string {
  return `payments-report-${report.period}-${report.periods[0]?.key ?? "all"}.csv`;
}
