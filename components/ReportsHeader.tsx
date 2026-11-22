import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { money } from "@/lib/statuses";
import { entryMs, formatDuration } from "@/lib/time-entries";
import { startOfMonthIn, startOfWeekIn, zonedMidnight, zonedParts } from "@/lib/timezone";
import PageTitle from "@/components/PageTitle";

/**
 * Reports (2026-11-21, heavy look): the Business "Overview" hub of four
 * doorway cards became ONE page — this header, then a tab strip for
 * Insights, Timesheets, Expenses and Team map. Each tab keeps its own URL
 * (/app/insights, /app/timesheets, /app/expenses, /app/team-map) and renders
 * this header on top; /app/business redirects to Insights.
 *
 * The summary is a picture of the business's own numbers, not a row of
 * equal number cards (David: those read AI-made):
 *   This month — what came in against what went out, as two bars on one
 *     scale; the gap between them is drawn as the profit (or the shortfall).
 *   This week  — hours on the clock per day, today in the brand.
 * Owners/admins only (every caller is manager-gated).
 */

export type ReportsTab = "insights" | "timesheets" | "expenses" | "team-map";

const TABS: { key: ReportsTab; label: string; href: string }[] = [
  { key: "insights", label: "Insights", href: "/app/insights" },
  { key: "timesheets", label: "Timesheets", href: "/app/timesheets" },
  { key: "expenses", label: "Expenses", href: "/app/expenses" },
  { key: "team-map", label: "Team map", href: "/app/team-map" },
];

export function ReportsTabs({ tab }: { tab: ReportsTab }) {
  return (
    <nav
      aria-label="Reports"
      className="flex w-full gap-1 overflow-x-auto rounded-[12px] bg-[color:var(--ds-surface-2)] p-1 sm:w-auto sm:inline-flex"
    >
      {TABS.map((t) => {
        const on = t.key === tab;
        return (
          <Link
            key={t.key}
            prefetch={false}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`font-display flex h-9 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-[9px] px-4 text-[13.5px] transition-colors sm:flex-none ${
              on
                ? "bg-[color:var(--ds-surface)] font-bold text-[color:var(--ds-ink)] shadow-[var(--ds-shadow-1)]"
                : "font-semibold text-[color:var(--ds-muted)] hover:text-[color:var(--ds-ink)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default async function ReportsHeader({
  companyId,
  tab,
  compact,
}: {
  companyId: string;
  tab: ReportsTab;
  /** Title + tabs only (the Team map tab, where the map needs the height). */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle heavy>Reports</PageTitle>
        <ReportsTabs tab={tab} />
      </div>
    );
  }

  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))?.timezone ??
    "America/Chicago";
  const now = new Date();
  const monthStart = startOfMonthIn(tz, now);
  const weekStart = startOfWeekIn(tz, now);
  const wp = zonedParts(tz, weekStart);
  const dayStarts = Array.from({ length: 8 }, (_, k) => zonedMidnight(tz, wp.y, wp.m, wp.d + k));

  const [monthIn, monthOut, weekEntries, onClock] = await Promise.all([
    prisma.payment.aggregate({ where: { companyId, paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { companyId, incurredAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.timeEntry.findMany({
      where: { companyId, startedAt: { gte: weekStart } },
      select: { startedAt: true, endedAt: true },
    }),
    prisma.timeEntry.count({ where: { companyId, endedAt: null } }),
  ]);

  const collected = Number(monthIn._sum.amount ?? 0);
  const spent = Number(monthOut._sum.amount ?? 0);
  const profit = collected - spent;
  const scale = Math.max(collected, spent, 1);
  const pct = (n: number) => `${(n / scale) * 100}%`;
  const monthName = now.toLocaleDateString("en-US", { month: "long", timeZone: tz });

  // Hours per day, credited to the day the shift started
  const todayKey = zonedParts(tz, now);
  const days = dayStarts.slice(0, 7).map((start, k) => {
    const end = dayStarts[k + 1];
    const ms = weekEntries
      .filter((e) => e.startedAt >= start && e.startedAt < end)
      .reduce((s, e) => s + entryMs(e, now), 0);
    const p = zonedParts(tz, start);
    return {
      key: k,
      ms,
      dow: start.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }),
      date: p.d,
      today: p.y === todayKey.y && p.m === todayKey.m && p.d === todayKey.d,
      future: start > now,
    };
  });
  const weekMs = days.reduce((s, d) => s + d.ms, 0);
  const maxMs = Math.max(1, ...days.map((d) => d.ms));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageTitle heavy>Reports</PageTitle>
      </div>

      <section className="ds-card ds-card-raised ds-rise mb-4 grid overflow-hidden lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* This month: in vs out on one scale; the gap is the profit */}
        <div className="min-w-0 p-5 lg:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold text-[color:var(--ds-muted)]">{monthName} so far</p>
            <Link prefetch={false} href="/app/expenses" className="text-[12.5px] font-bold text-[color:var(--ds-primary)] hover:underline">
              Log an expense
            </Link>
          </div>
          <p className="mt-1 text-[13.5px] font-semibold text-[color:var(--ds-ink-2)]">
            {profit >= 0 ? "Profit" : "Spent more than came in"}
          </p>
          <p
            className={`font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.04em] tabular-nums lg:text-[48px] ${
              profit < 0 ? "text-[color:var(--ds-bad)]" : "text-[color:var(--ds-ink)]"
            }`}
          >
            {profit < 0 ? "−" : ""}
            {money(Math.abs(profit))}
          </p>

          <div className="mt-5 space-y-2.5" role="img" aria-label={`Collected ${money(collected)}, spent ${money(spent)}, ${profit >= 0 ? "profit" : "short"} ${money(Math.abs(profit))}`}>
            {/* In */}
            <div className="grid grid-cols-[66px_minmax(0,1fr)_84px] items-center gap-3">
              <span className="text-[12.5px] font-bold text-[color:var(--ds-ink-2)]">Came in</span>
              <div className="relative h-7">
                <div
                  className="absolute inset-y-0 left-0 rounded-[5px] bg-[color:var(--ds-good)]"
                  style={{ width: collected > 0 ? pct(collected) : "2px" }}
                  title={`Collected in ${monthName}: ${money(collected)}`}
                />
                {profit < 0 && (
                  <div
                    className="absolute inset-y-0 rounded-[5px] border-2 border-dashed border-[color:var(--ds-bad)]"
                    style={{ left: pct(collected), width: pct(-profit) }}
                    title={`Short by ${money(-profit)}`}
                  />
                )}
              </div>
              <span className="text-right text-[13.5px] font-extrabold tabular-nums text-[color:var(--ds-ink)]">{money(collected)}</span>
            </div>
            {/* Out, with the profit gap drawn after it */}
            <div className="grid grid-cols-[66px_minmax(0,1fr)_84px] items-center gap-3">
              <span className="text-[12.5px] font-bold text-[color:var(--ds-ink-2)]">Went out</span>
              <div className="relative h-7">
                <div
                  className="absolute inset-y-0 left-0 rounded-[5px] bg-[color:var(--ds-ink-2)]"
                  style={{ width: spent > 0 ? pct(spent) : "2px" }}
                  title={`Expenses in ${monthName}: ${money(spent)}`}
                />
                {profit > 0 && (
                  <div
                    className="absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-[5px] border-2 border-dashed border-[color:var(--ds-good)] px-2"
                    style={{ left: `calc(${pct(spent)} + 3px)`, width: `calc(${pct(profit)} - 3px)` }}
                    title={`Profit: ${money(profit)}`}
                  >
                    <span className="truncate text-[11.5px] font-bold text-[color:var(--ds-good)]">profit</span>
                  </div>
                )}
              </div>
              <span className="text-right text-[13.5px] font-extrabold tabular-nums text-[color:var(--ds-ink)]">{money(spent)}</span>
            </div>
          </div>
        </div>

        {/* This week: hours on the clock per day */}
        <div className="min-w-0 border-t border-[color:var(--ds-line)] p-5 lg:border-l lg:border-t-0 lg:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-bold text-[color:var(--ds-muted)]">Hours this week</p>
            <Link
              prefetch={false}
              href="/app/team-map"
              className="inline-flex items-center gap-0.5 text-[12.5px] font-bold text-[color:var(--ds-primary)] hover:underline"
            >
              {onClock === 0 ? "Nobody on the clock" : `${onClock} on the clock now`}
              <ChevronRight size={13} aria-hidden />
            </Link>
          </div>
          <p className="font-display mt-1 text-[32px] font-extrabold leading-[1.05] tracking-[-0.035em] tabular-nums text-[color:var(--ds-ink)]">
            {formatDuration(weekMs)}
          </p>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {days.map((d) => (
              <Link
                key={d.key}
                prefetch={false}
                href="/app/timesheets"
                title={`${d.dow} ${d.date}: ${formatDuration(d.ms)}`}
                className={`flex flex-col items-center gap-1 rounded-[8px] px-0.5 pb-1.5 pt-1 transition-colors hover:bg-[color:var(--ds-surface-2)] ${
                  d.future ? "opacity-45" : ""
                }`}
              >
                <span className="flex h-[64px] w-full max-w-[34px] items-end border-b-2 border-[color:var(--ds-line-strong)]">
                  <span
                    className={`w-full rounded-t-[4px] ${d.today ? "bg-[color:var(--ds-primary)]" : "bg-[color:color-mix(in_srgb,var(--ds-primary)_40%,var(--ds-surface))]"}`}
                    style={{ height: d.ms > 0 ? `${Math.max(8, (d.ms / maxMs) * 100)}%` : "2px" }}
                  />
                </span>
                <span className={`text-[11.5px] font-semibold ${d.today ? "font-bold text-[color:var(--ds-primary)]" : "text-[color:var(--ds-muted)]"}`}>
                  {d.dow}
                </span>
                <span
                  className={`min-w-[22px] rounded-[6px] px-1 text-center text-[13px] font-extrabold ${
                    d.today ? "bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]" : "text-[color:var(--ds-ink)]"
                  }`}
                >
                  {d.date}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mb-5 lg:mb-6">
        <ReportsTabs tab={tab} />
      </div>
    </div>
  );
}
