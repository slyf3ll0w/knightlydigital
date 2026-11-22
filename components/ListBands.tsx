import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CountUp from "@/components/CountUp";
import { money } from "@/lib/statuses";

/**
 * The heavy-look page summaries (2026-11-21): a row of NUMBER CARDS at the
 * top of a page, each drawn from that page's own data. A card is a solid
 * white surface with a thick color strip on top (the tone says what the
 * number means: brand, red past due, amber needs you, green money in, gray
 * quiet), a big number, a line of context, and, where the data has a shape,
 * a small single-series chart (won per week, collected per month, the week).
 *
 * History: round 1 was a glowing brand band, round 2 an on-page tally that
 * blended in, round 3 a dark slab. David turned down all three and picked
 * cards with mini charts.
 *   Quotes   → PipelineBand  (Draft / Awaiting / Approved + won, by week)
 *   Jobs     → WeekBand      (this week as a strip + to invoice / unscheduled)
 *   Invoices → MoneyBand     (past due / awaiting / collected, by month / drafts)
 *   Requests → InboxBand     (waiting, needs approval, the oldest waiting)
 *   Agreements → SignBand    (out for signature / signed / drafts)
 * Recurring, the client page, Payments and Home use StatCard directly.
 * Styles: the .ds-stat* block in app/ds.css.
 */

export type StatTone = "brand" | "bad" | "warn" | "good" | "neutral";

const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

/** The grid the cards sit in: two across on a phone, as many as fit on desktop. */
export function StatCards({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`ds-stats mb-5 lg:mb-6 ${className}`}>{children}</section>;
}

export function StatCard({
  label,
  value,
  sub,
  href,
  tone = "brand",
  chart,
  wide,
  i = 1,
  aside,
  children,
  className = "",
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: StatTone;
  chart?: React.ReactNode;
  /** Spans two columns (the week strip, the waiting list). */
  wide?: boolean;
  /** Stagger index for the rise-in. */
  i?: number;
  /** Small link/text set top-right, beside the label. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <span className="ds-stat-head">
        <span className="ds-stat-label">{label}</span>
        {aside}
      </span>
      {value !== undefined && <span className="ds-stat-value">{value}</span>}
      {sub && <span className="ds-stat-sub">{sub}</span>}
      {chart && <span className="ds-stat-chart">{chart}</span>}
      {children}
    </>
  );
  const cls = `ds-stat ds-rise ${wide ? "is-wide" : ""} ${href ? "is-link" : ""} ${className}`;
  return href ? (
    <Link prefetch={false} href={href} className={cls} data-tone={tone} style={rise(i)}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-tone={tone} style={rise(i)}>
      {body}
    </div>
  );
}

export type SparkPoint = { label: string; value: number; display: string };

/**
 * A single-series bar spark in the card's tone. The last bar (now) is full
 * strength, earlier ones lighter; each bar names itself on hover. Zero is a
 * 2px stub on the baseline so an empty week still reads as a week.
 */
export function Spark({ points, summary }: { points: SparkPoint[]; summary: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <span className="ds-spark" role="img" aria-label={summary}>
      {points.map((p, k) => (
        <span key={k} className="ds-spark-col" title={`${p.label}: ${p.display}`}>
          <span
            className={`ds-spark-bar ${k === points.length - 1 ? "is-now" : ""}`}
            style={{ height: p.value > 0 ? `${Math.max(8, (p.value / max) * 100)}%` : "2px" }}
          />
        </span>
      ))}
    </span>
  );
}

/* ── Quotes ─────────────────────────────────────────────────────────────── */

export type PipelineStage = { key: string; label: string; count: number; amount: number; href: string };

export function PipelineBand({
  stages,
  won30,
  conversion,
  wonHref,
  showMoney,
  wonWeeks,
}: {
  stages: PipelineStage[];
  won30: number;
  conversion: number | null;
  wonHref: string;
  showMoney: boolean;
  wonWeeks?: SparkPoint[];
}) {
  const toneFor = (key: string): StatTone => (key === "APPROVED" ? "good" : key === "DRAFT" ? "neutral" : "brand");
  return (
    <StatCards>
      {stages.map((s, k) => (
        <StatCard
          key={s.key}
          i={k + 1}
          href={s.href}
          tone={toneFor(s.key)}
          label={s.label}
          value={<CountUp value={s.count} />}
          sub={showMoney ? money(s.amount) : undefined}
        />
      ))}
      {showMoney && (
        <StatCard
          i={stages.length + 1}
          href={wonHref}
          tone="good"
          label="Won · last 30 days"
          value={<CountUp value={money(won30)} />}
          sub={conversion === null ? "No quotes sent in 30 days" : `${conversion}% of sent quotes approved`}
          chart={wonWeeks && <Spark points={wonWeeks} summary="Approved quote value per week, last 8 weeks" />}
        />
      )}
    </StatCards>
  );
}

/* ── Jobs ───────────────────────────────────────────────────────────────── */

export type WeekDay = { key: string; dow: string; date: number; count: number; today: boolean; past: boolean; href: string };

export function WeekBand({
  days,
  active,
  toInvoice,
  unscheduled,
}: {
  days: WeekDay[];
  active: { count: number; href: string };
  toInvoice: { count: number; href: string };
  unscheduled: { count: number; href: string };
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);
  return (
    <StatCards>
      <StatCard
        wide
        i={1}
        tone="brand"
        label={`This week · ${total === 0 ? "nothing scheduled" : `${total} ${total === 1 ? "job" : "jobs"}`}`}
        aside={
          <Link prefetch={false} href={active.href} className="ds-stat-aside">
            {active.count} active
            <ChevronRight size={13} aria-hidden />
          </Link>
        }
      >
        <span className="ds-week">
          {days.map((d) => (
            <Link
              key={d.key}
              prefetch={false}
              href={d.href}
              className={`ds-week-day ${d.today ? "is-today" : ""} ${d.past ? "is-past" : ""}`}
              aria-label={`${d.dow} ${d.date}: ${d.count} ${d.count === 1 ? "job" : "jobs"}`}
            >
              <span className="ds-week-count">{d.count || ""}</span>
              <span className="ds-week-track">
                <span className="ds-week-bar" style={{ height: d.count ? `${Math.max(12, (d.count / max) * 100)}%` : "2px" }} />
              </span>
              <span className="ds-week-dow">{d.dow}</span>
              <span className="ds-week-date">{d.date}</span>
            </Link>
          ))}
        </span>
      </StatCard>
      <StatCard
        i={2}
        href={toInvoice.href}
        tone={toInvoice.count > 0 ? "warn" : "neutral"}
        label="Ready to invoice"
        value={<CountUp value={toInvoice.count} />}
        sub={toInvoice.count > 0 ? "Done, not billed yet" : "All billed"}
      />
      <StatCard
        i={3}
        href={unscheduled.href}
        tone={unscheduled.count > 0 ? "warn" : "neutral"}
        label="Not scheduled"
        value={<CountUp value={unscheduled.count} />}
        sub={unscheduled.count > 0 ? "Active jobs with no date" : "Everything has a date"}
      />
    </StatCards>
  );
}

/* ── Invoices ───────────────────────────────────────────────────────────── */

export function MoneyBand({
  pastDue,
  awaiting,
  draft,
  paidThisMonth,
  collectedMonths,
}: {
  pastDue: { amount: number; count: number; href: string };
  awaiting: { amount: number; count: number; href: string };
  draft: { amount: number; count: number; href: string };
  paidThisMonth: { amount: number; href: string };
  collectedMonths?: SparkPoint[];
}) {
  const n = (c: number) => `${c} ${c === 1 ? "invoice" : "invoices"}`;
  return (
    <StatCards>
      <StatCard
        i={1}
        href={pastDue.href}
        tone={pastDue.amount > 0 ? "bad" : "neutral"}
        label="Past due"
        value={<CountUp value={money(pastDue.amount)} />}
        sub={pastDue.count > 0 ? n(pastDue.count) : "Nothing late"}
      />
      <StatCard
        i={2}
        href={awaiting.href}
        tone="brand"
        label="Awaiting payment"
        value={<CountUp value={money(awaiting.amount)} />}
        sub={n(awaiting.count)}
      />
      <StatCard
        i={3}
        href={paidThisMonth.href}
        tone="good"
        label="Collected this month"
        value={<CountUp value={money(paidThisMonth.amount)} />}
        chart={collectedMonths && <Spark points={collectedMonths} summary="Money collected per month, last 6 months" />}
      />
      <StatCard
        i={4}
        href={draft.href}
        tone="neutral"
        label="Drafts"
        value={<CountUp value={money(draft.amount)} />}
        sub={n(draft.count)}
      />
    </StatCards>
  );
}

/* ── Requests ───────────────────────────────────────────────────────────── */

export type InboxItem = { id: string; name: string; title: string; age: string; approval: boolean };

export function InboxBand({
  waiting,
  oldest,
  items,
  needsApproval,
  allHref,
}: {
  waiting: number;
  oldest: string | null;
  items: InboxItem[];
  needsApproval: { count: number; href: string };
  allHref: string;
}) {
  return (
    <StatCards>
      <StatCard
        i={1}
        href={allHref}
        tone="brand"
        label="Waiting on you"
        value={<CountUp value={waiting} />}
        sub={waiting === 0 ? "Inbox zero" : oldest ? `Oldest: ${oldest}` : "New today"}
      />
      <StatCard
        i={2}
        href={needsApproval.href}
        tone={needsApproval.count > 0 ? "warn" : "neutral"}
        label="Bookings to approve"
        value={<CountUp value={needsApproval.count} />}
        sub={needsApproval.count > 0 ? "Clients picked a time" : "None waiting"}
      />
      {items.length > 0 && (
        <StatCard wide i={3} tone="neutral" label="Waiting longest">
          <ul className="ds-stat-list">
            {items.map((r) => (
              <li key={r.id}>
                <Link prefetch={false} href={`/app/requests/${r.id}`} className="ds-stat-line">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{r.name}</span>
                    <span className="block truncate text-[12.5px] text-[color:var(--ds-muted)]">{r.title}</span>
                  </span>
                  <span className={`ds-stat-age ${r.approval ? "is-alert" : ""}`}>{r.approval ? "Approve" : r.age}</span>
                </Link>
              </li>
            ))}
          </ul>
        </StatCard>
      )}
    </StatCards>
  );
}

/** "3 hours", "2 days" — how long something has been waiting. */
export function waitedFor(since: Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000));
  if (mins < 60) return mins <= 1 ? "a minute" : `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? "1 hour" : `${hrs} hours`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/* ── Agreements ─────────────────────────────────────────────────────────── */

export function SignBand({
  out,
  oldest,
  outHref,
  signed30,
  signedHref,
  drafts,
  draftsHref,
}: {
  out: number;
  oldest: string | null;
  outHref: string;
  signed30: number;
  signedHref: string;
  drafts: number;
  draftsHref: string;
}) {
  return (
    <StatCards>
      <StatCard
        i={1}
        href={outHref}
        tone="brand"
        label="Out for signature"
        value={<CountUp value={out} />}
        sub={out === 0 ? "Nothing waiting on a client" : oldest ? `Oldest sent ${oldest} ago` : "Sent today"}
      />
      <StatCard i={2} href={signedHref} tone="good" label="Signed · last 30 days" value={<CountUp value={signed30} />} />
      <StatCard i={3} href={draftsHref} tone="neutral" label="Drafts" value={<CountUp value={drafts} />} />
    </StatCards>
  );
}
