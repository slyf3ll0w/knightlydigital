import Link from "next/link";
import { ArrowRight, ChevronRight, Check } from "lucide-react";
import CountUp from "@/components/CountUp";
import Monogram from "@/components/Monogram";
import { money } from "@/lib/statuses";

/**
 * The heavy-look page pictures (2026-11-21). Each list page opens with ONE
 * picture drawn from its own work, the way Jobs shows the week: Quotes as
 * lanes holding the actual clients, Invoices as an aging line of dots,
 * Requests as a stack of letters, Agreements as paper sheets waiting for a
 * signature, Recurring as the next 30 days of bill dates (RecurringStrip in
 * SubscriptionsClient), Payments as money flowing to the bank.
 *
 * History, so nobody walks it back: round 1 was a glowing brand band, round
 * 2 an on-page tally (bland), round 3 a dark slab ("just like the glowing
 * thing"), round 4 a row of four number cards ("if I gave an AI a basic idea
 * of WorkBench it would come up with that"). David's rule: no generic KPI
 * tiles — every page draws its own data in its own shape.
 *
 * Styles: the .ds-pic* block in app/ds.css. StatCard survives for the two
 * figures beside a client's name and Home's clear day.
 */

const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

/** The one panel a page picture sits in: a sentence for a title, links aside. */
export function Picture({
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
    <section className={`ds-pic ds-rise mb-5 lg:mb-6 ${className}`} style={rise(1)}>
      <div className="ds-pic-head">
        <h2 className="ds-pic-title">{title}</h2>
        {aside && <div className="ds-pic-aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** A small link in a picture's aside: "3 ready to invoice ›". */
export function PicLink({ href, children, alert }: { href: string; children: React.ReactNode; alert?: "bad" | "warn" }) {
  return (
    <Link prefetch={false} href={href} className={`ds-pic-link ${alert ? `is-${alert}` : ""}`}>
      {children}
      <ChevronRight size={13} strokeWidth={2.4} aria-hidden />
    </Link>
  );
}

/* ── kept: a single figure card (client page, Home clear day) ──────────── */

export type StatTone = "brand" | "bad" | "warn" | "good" | "neutral";

export function StatCards({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`ds-stats mb-5 lg:mb-6 ${className}`}>{children}</section>;
}

export function StatCard({
  label,
  value,
  sub,
  href,
  tone = "neutral",
  i = 1,
  className = "",
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: StatTone;
  i?: number;
  className?: string;
}) {
  const body = (
    <>
      <span className="ds-stat-label">{label}</span>
      {value !== undefined && <span className="ds-stat-value">{value}</span>}
      {sub && <span className="ds-stat-sub">{sub}</span>}
    </>
  );
  const cls = `ds-stat ds-rise ${href ? "is-link" : ""} ${className}`;
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

/** A small single-series bar spark; the last bar (now) is full strength. */
export function Spark({ points, summary }: { points: SparkPoint[]; summary: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <span className="ds-spark" role="img" aria-label={summary}>
      {points.map((p, k) => (
        <span key={k} className="ds-spark-col" title={`${p.label}: ${p.display}`}>
          <span
            className={`ds-spark-bar ${k === points.length - 1 ? "is-now" : ""}`}
            style={{ height: p.value > 0 ? `${Math.max(10, (p.value / max) * 100)}%` : "2px" }}
          />
        </span>
      ))}
    </span>
  );
}

/* ── Quotes: lanes holding the actual clients ───────────────────────────── */

export type LanePerson = { id: string; name: string; href: string; title: string };
export type PipelineStage = {
  key: string;
  label: string;
  count: number;
  amount: number;
  href: string;
  people?: LanePerson[];
};

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
  const open = stages.filter((s) => s.key !== "APPROVED");
  const openCount = open.reduce((n, s) => n + s.count, 0);
  const openAmount = open.reduce((n, s) => n + s.amount, 0);
  return (
    <Picture
      title={
        openCount === 0 ? (
          "No open quotes"
        ) : showMoney ? (
          <>
            <b>{money(openAmount)}</b> in {openCount} open {openCount === 1 ? "quote" : "quotes"}
          </>
        ) : (
          <>
            <b>{openCount}</b> open {openCount === 1 ? "quote" : "quotes"}
          </>
        )
      }
      aside={
        showMoney && (
          <Link prefetch={false} href={wonHref} className="ds-pic-won">
            <span>
              <span className="ds-pic-won-label">Won · 30 days</span>
              <span className="ds-pic-won-value">
                <CountUp value={money(won30)} />
              </span>
              <span className="ds-pic-won-note">
                {conversion === null ? "nothing sent" : `${conversion}% approved`}
              </span>
            </span>
            {wonWeeks && <Spark points={wonWeeks} summary="Approved quote value per week, last 8 weeks" />}
          </Link>
        )
      }
    >
      <ol className="ds-lanes">
        {stages.map((s, k) => {
          const people = s.people ?? [];
          const more = Math.max(0, s.count - people.length);
          return (
            <li key={s.key} className="ds-lane" data-stage={s.key}>
              {k > 0 && <ArrowRight size={18} strokeWidth={2.4} className="ds-lane-arrow" aria-hidden />}
              <Link prefetch={false} href={s.href} className="ds-lane-head">
                <span className="ds-lane-label">{s.label}</span>
                <span className="ds-lane-count">{s.count}</span>
              </Link>
              <div className="ds-lane-track">
                {people.length === 0 ? (
                  <span className="ds-lane-empty">None</span>
                ) : (
                  <span className="ds-lane-people">
                    {people.map((p) => (
                      <Link key={p.id} prefetch={false} href={p.href} className="ds-lane-person" title={`${p.name}${p.title ? ` · ${p.title}` : ""}`}>
                        <Monogram name={p.name} size={34} />
                      </Link>
                    ))}
                    {more > 0 && (
                      <Link prefetch={false} href={s.href} className="ds-lane-more">
                        +{more}
                      </Link>
                    )}
                  </span>
                )}
              </div>
              {showMoney && <span className="ds-lane-money">{money(s.amount)}</span>}
            </li>
          );
        })}
      </ol>
    </Picture>
  );
}

/* ── Jobs: the week ─────────────────────────────────────────────────────── */

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
    <Picture
      title={
        total === 0 ? (
          "Nothing scheduled this week"
        ) : (
          <>
            <b>{total}</b> {total === 1 ? "job" : "jobs"} this week
          </>
        )
      }
      aside={
        <>
          <PicLink href={active.href}>{active.count} active</PicLink>
          {toInvoice.count > 0 && (
            <PicLink href={toInvoice.href} alert="warn">
              {toInvoice.count} ready to invoice
            </PicLink>
          )}
          {unscheduled.count > 0 && (
            <PicLink href={unscheduled.href} alert="warn">
              {unscheduled.count} not scheduled
            </PicLink>
          )}
        </>
      }
    >
      <div className="ds-week">
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
      </div>
    </Picture>
  );
}

/* ── Invoices: the aging line ───────────────────────────────────────────── */

/** daysLate: < 0 = due in that many days, null = no due date (treated as not due). */
export type OpenInvoice = { id: string; name: string; amount: number; daysLate: number | null };

const AGING = [
  { key: "due", label: "Not due yet" },
  { key: "30", label: "1–30 days late" },
  { key: "60", label: "31–60" },
  { key: "90", label: "61–90" },
  { key: "90+", label: "90+" },
] as const;

function agingSpot(daysLate: number | null): { col: number; frac: number } {
  const d = daysLate ?? -30;
  if (d <= 0) return { col: 0, frac: 1 - Math.min(30, -d) / 30 };
  if (d <= 30) return { col: 1, frac: d / 30 };
  if (d <= 60) return { col: 2, frac: (d - 30) / 30 };
  if (d <= 90) return { col: 3, frac: (d - 60) / 30 };
  return { col: 4, frac: Math.min(1, (d - 90) / 90) };
}

/** A steady 0–1 from an id, so a dot keeps its height between visits. */
function idSpread(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export function MoneyBand({
  pastDue,
  awaiting,
  draft,
  paidThisMonth,
  collectedMonths,
  open = [],
}: {
  pastDue: { amount: number; count: number; href: string };
  awaiting: { amount: number; count: number; href: string };
  draft: { amount: number; count: number; href: string };
  paidThisMonth: { amount: number; href: string };
  collectedMonths?: SparkPoint[];
  open?: OpenInvoice[];
}) {
  const owed = pastDue.amount + awaiting.amount;
  const shown = [...open].sort((a, b) => b.amount - a.amount).slice(0, 60);
  const maxAmt = Math.max(1, ...shown.map((o) => o.amount));
  return (
    <Picture
      title={
        owed === 0 ? (
          "Nobody owes you anything"
        ) : (
          <>
            Clients owe you <b>{money(owed)}</b>
            {pastDue.amount > 0 && (
              <>
                {" "}
                · <Link prefetch={false} href={pastDue.href} className="ds-pic-bad">{money(pastDue.amount)} past due</Link>
              </>
            )}
          </>
        )
      }
      aside={
        <>
          <Link prefetch={false} href={paidThisMonth.href} className="ds-pic-won">
            <span>
              <span className="ds-pic-won-label">Collected this month</span>
              <span className="ds-pic-won-value">
                <CountUp value={money(paidThisMonth.amount)} />
              </span>
            </span>
            {collectedMonths && <Spark points={collectedMonths} summary="Money collected per month, last 6 months" />}
          </Link>
          {draft.count > 0 && (
            <PicLink href={draft.href}>
              {draft.count} {draft.count === 1 ? "draft" : "drafts"} · {money(draft.amount)}
            </PicLink>
          )}
        </>
      }
    >
      <div className="ds-aging" role="img" aria-label={`${open.length} unpaid invoices by how late they are`}>
        <div className="ds-aging-field">
          {AGING.map((b, k) => (
            <span key={b.key} className={`ds-aging-zone ${k > 0 ? "is-late" : ""}`} style={{ left: `${k * 20}%` }} />
          ))}
          {shown.map((o) => {
            const { col, frac } = agingSpot(o.daysLate);
            const size = 12 + 22 * Math.sqrt(o.amount / maxAmt);
            const late = (o.daysLate ?? 0) > 0;
            const when =
              o.daysLate === null ? "no due date" : o.daysLate > 0 ? `${o.daysLate} days late` : o.daysLate === 0 ? "due today" : `due in ${-o.daysLate} days`;
            return (
              <Link
                key={o.id}
                prefetch={false}
                href={`/app/invoices/${o.id}`}
                className={`ds-aging-dot ${late ? "is-late" : ""}`}
                title={`${o.name} · ${money(o.amount)} · ${when}`}
                style={{
                  left: `calc(${(col + 0.08 + frac * 0.84) * 20}% - ${size / 2}px)`,
                  top: `calc(${12 + idSpread(o.id) * 76}% - ${size / 2}px)`,
                  width: size,
                  height: size,
                }}
              />
            );
          })}
          {open.length === 0 && <span className="ds-aging-none">No unpaid invoices</span>}
        </div>
        <div className="ds-aging-axis">
          {AGING.map((b, k) => (
            <span key={b.key} className={k > 0 ? "is-late" : ""}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </Picture>
  );
}

/* ── Requests: a stack of letters ───────────────────────────────────────── */

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
    <Picture
      title={
        waiting === 0 ? (
          "Inbox zero — nobody is waiting"
        ) : (
          <>
            <Link prefetch={false} href={allHref} className="hover:underline">
              <b>{waiting}</b> waiting on you
            </Link>
            {oldest && <span className="ds-pic-quiet"> · oldest {oldest}</span>}
          </>
        )
      }
      aside={
        needsApproval.count > 0 && (
          <PicLink href={needsApproval.href} alert="warn">
            {needsApproval.count} {needsApproval.count === 1 ? "booking" : "bookings"} to approve
          </PicLink>
        )
      }
    >
      {items.length > 0 && (
        <ul className="ds-letters">
          {items.map((r, k) => (
            <li key={r.id} className="ds-letter-wrap" style={{ "--k": k } as React.CSSProperties}>
              <Link prefetch={false} href={`/app/requests/${r.id}`} className={`ds-letter ${r.approval ? "is-approval" : ""}`}>
                <span className="ds-letter-from">
                  <Monogram name={r.name} size={28} />
                  <span className="min-w-0 truncate">{r.name}</span>
                </span>
                <span className="ds-letter-title">{r.title || "New request"}</span>
                <span className="ds-letter-foot">
                  {r.approval ? <span className="ds-letter-flag">Approve</span> : <span>Waiting {r.age}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Picture>
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

/* ── Agreements: sheets waiting for a signature ─────────────────────────── */

export type Sheet = { id: string; name: string; title: string; note: string; signed: boolean };

export function SignBand({
  out,
  oldest,
  outHref,
  signed30,
  signedHref,
  drafts,
  draftsHref,
  sheets = [],
}: {
  out: number;
  oldest: string | null;
  outHref: string;
  signed30: number;
  signedHref: string;
  drafts: number;
  draftsHref: string;
  sheets?: Sheet[];
}) {
  return (
    <Picture
      title={
        out === 0 ? (
          "Nothing waiting on a signature"
        ) : (
          <>
            <Link prefetch={false} href={outHref} className="hover:underline">
              <b>{out}</b> out for signature
            </Link>
            {oldest && <span className="ds-pic-quiet"> · oldest sent {oldest} ago</span>}
          </>
        )
      }
      aside={
        <>
          <PicLink href={signedHref}>{signed30} signed in 30 days</PicLink>
          {drafts > 0 && <PicLink href={draftsHref}>{drafts} {drafts === 1 ? "draft" : "drafts"}</PicLink>}
        </>
      }
    >
      {sheets.length > 0 && (
        <ul className="ds-sheets">
          {sheets.map((s) => (
            <li key={s.id}>
              <Link prefetch={false} href={`/app/contracts/${s.id}`} className={`ds-sheet ${s.signed ? "is-signed" : ""}`} title={`${s.title} · ${s.name}`}>
                <span className="ds-sheet-title">{s.title}</span>
                <span className="ds-sheet-lines" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="ds-sheet-sign" aria-hidden>
                  {s.signed ? (
                    <svg viewBox="0 0 80 22" className="ds-sheet-sig">
                      <path d="M3 16c6-9 9-12 11-9s-3 10 1 9 6-11 9-10-1 9 3 8 5-7 8-6 0 6 4 5 7-5 10-5 3 4 7 3 10-3 19-3" />
                    </svg>
                  ) : null}
                </span>
                <span className="ds-sheet-name">{s.name}</span>
                <span className="ds-sheet-note">
                  {s.signed && <Check size={11} strokeWidth={3} aria-hidden />}
                  {s.note}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Picture>
  );
}

/* ── Payments: money on its way ─────────────────────────────────────────── */

export function PayFlow({
  label,
  aside,
  steps,
  footer,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  steps: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; lead?: boolean }[];
  footer?: React.ReactNode;
}) {
  return (
    <Picture title={label} aside={aside}>
      <ol className="ds-flow">
        {steps.map((s, k) => {
          const inner = (
            <>
              <span className="ds-flow-label">{s.label}</span>
              <span className="ds-flow-value">{s.value}</span>
              {s.note && <span className="ds-flow-note">{s.note}</span>}
            </>
          );
          return (
            <li key={k} className={`ds-flow-step ${s.lead ? "is-lead" : ""}`}>
              {k > 0 && <ArrowRight size={20} strokeWidth={2.4} className="ds-flow-arrow" aria-hidden />}
              {s.href ? (
                <Link prefetch={false} href={s.href} className="ds-flow-box">
                  {inner}
                </Link>
              ) : (
                <div className="ds-flow-box">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
      {footer}
    </Picture>
  );
}
