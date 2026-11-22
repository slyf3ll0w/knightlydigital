import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CountUp from "@/components/CountUp";
import { money } from "@/lib/statuses";

/**
 * The heavy-look list headers (2026-11-21). Each list page gets ONE tally
 * built from its own data, so Quotes, Jobs, Invoices and Requests stop
 * looking like the same page with different words (David's tickets):
 *   Quotes   → PipelineBand  (Draft → Awaiting → Approved, won in 30 days)
 *   Jobs     → WeekBand      (this week's schedule as a strip + the to-dos)
 *   Invoices → MoneyBand     (what's owed, split past due / awaiting)
 *   Requests → InboxBand     (what's waiting on a reply, oldest first)
 * Server components; styles are the .ds-tally / .ds-lb-* block in app/ds.css. Replaces
 * KpiStrip on these four pages.
 */

const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

function Shell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`ds-tally ds-rise ds-lb mb-5 lg:mb-6 ${className}`} style={rise(1)}>
      <div className="relative">{children}</div>
    </section>
  );
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ds-lb-side">
      <p className="ds-lb-label">{title}</p>
      {children}
    </div>
  );
}

function SideLink({ href, label, value, alert }: { href: string; label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <Link prefetch={false} href={href} className={`ds-lb-sidelink ${alert ? "is-alert" : ""}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="ds-lb-sidevalue">{value}</span>
      <ChevronRight size={14} className="shrink-0 opacity-60" aria-hidden />
    </Link>
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
}: {
  stages: PipelineStage[];
  won30: number;
  conversion: number | null;
  wonHref: string;
  showMoney: boolean;
}) {
  return (
    <Shell>
      <div className="ds-lb-grid">
        <div className="min-w-0">
          <p className="ds-lb-label">Your pipeline</p>
          <ol className="ds-lb-pipe">
            {stages.map((s, i) => (
              <li key={s.key} className="contents">
                {i > 0 && <ChevronRight size={20} strokeWidth={2.6} className="ds-lb-pipe-arrow" aria-hidden />}
                <Link prefetch={false} href={s.href} className="ds-lb-stage">
                  <span className="ds-lb-stage-label">{s.label}</span>
                  <span className="ds-lb-stage-count">
                    <CountUp value={s.count} />
                  </span>
                  {showMoney && <span className="ds-lb-stage-sub">{money(s.amount)}</span>}
                </Link>
              </li>
            ))}
          </ol>
        </div>
        {showMoney && (
          <Side title="Won · last 30 days">
            <Link prefetch={false} href={wonHref} className="ds-lb-big">
              <CountUp value={money(won30)} />
            </Link>
            <p className="ds-lb-note">
              {conversion === null ? "No quotes sent in 30 days" : `${conversion}% of sent quotes approved`}
            </p>
          </Side>
        )}
      </div>
    </Shell>
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
    <Shell>
      <div className="ds-lb-grid">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="ds-lb-label">This week</p>
            <p className="ds-lb-note !mt-0">
              {total === 0 ? "Nothing scheduled" : `${total} ${total === 1 ? "job" : "jobs"} scheduled`}
            </p>
          </div>
          <div className="ds-lb-week">
            {days.map((d) => (
              <Link
                key={d.key}
                prefetch={false}
                href={d.href}
                className={`ds-lb-day ${d.today ? "is-today" : ""} ${d.past ? "is-past" : ""}`}
                aria-label={`${d.dow} ${d.date}: ${d.count} ${d.count === 1 ? "job" : "jobs"}`}
              >
                <span className="ds-lb-day-count">{d.count || ""}</span>
                <span className="ds-lb-day-track">
                  <span className="ds-lb-day-bar" style={{ height: `${d.count ? Math.max(14, (d.count / max) * 100) : 0}%` }} />
                </span>
                <span className="ds-lb-day-dow">{d.dow}</span>
                <span className="ds-lb-day-date">{d.date}</span>
              </Link>
            ))}
          </div>
        </div>
        <Side title="On your list">
          <SideLink href={active.href} label="Active" value={active.count} />
          <SideLink href={toInvoice.href} label="Ready to invoice" value={toInvoice.count} alert={toInvoice.count > 0} />
          <SideLink href={unscheduled.href} label="Not scheduled" value={unscheduled.count} alert={unscheduled.count > 0} />
        </Side>
      </div>
    </Shell>
  );
}

/* ── Invoices ───────────────────────────────────────────────────────────── */

export function MoneyBand({
  pastDue,
  awaiting,
  draft,
  paidThisMonth,
}: {
  pastDue: { amount: number; count: number; href: string };
  awaiting: { amount: number; count: number; href: string };
  draft: { amount: number; count: number; href: string };
  paidThisMonth: { amount: number; href: string };
}) {
  const owed = pastDue.amount + awaiting.amount;
  const pdPct = owed > 0 ? (pastDue.amount / owed) * 100 : 0;
  return (
    <Shell>
      <div className="ds-lb-grid">
        <div className="min-w-0">
          <p className="ds-lb-label">Clients owe you</p>
          <p className="ds-lb-big">
            <CountUp value={money(owed)} />
          </p>
          <div className="ds-lb-split" aria-hidden>
            {owed > 0 ? (
              <>
                {pastDue.amount > 0 && <span className="ds-lb-split-due" style={{ width: `${Math.max(pdPct, 3)}%` }} />}
                {awaiting.amount > 0 && <span className="ds-lb-split-wait" style={{ flex: 1 }} />}
              </>
            ) : (
              <span className="ds-lb-split-none" style={{ flex: 1 }} />
            )}
          </div>
          <div className="ds-lb-legend">
            <Link prefetch={false} href={pastDue.href} className="ds-lb-key">
              <span className="ds-lb-swatch is-due" />
              Past due <b>{money(pastDue.amount)}</b>
              <span className="opacity-70">· {pastDue.count}</span>
            </Link>
            <Link prefetch={false} href={awaiting.href} className="ds-lb-key">
              <span className="ds-lb-swatch is-wait" />
              Awaiting payment <b>{money(awaiting.amount)}</b>
              <span className="opacity-70">· {awaiting.count}</span>
            </Link>
          </div>
        </div>
        <Side title="This month">
          <SideLink href={paidThisMonth.href} label="Collected" value={money(paidThisMonth.amount)} />
          <SideLink href={draft.href} label={`Drafts (${draft.count})`} value={money(draft.amount)} />
        </Side>
      </div>
    </Shell>
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
    <Shell>
      <div className="ds-lb-grid is-inbox">
        <div className="min-w-0">
          <p className="ds-lb-label">Waiting on you</p>
          <Link prefetch={false} href={allHref} className="ds-lb-big">
            <CountUp value={waiting} />
          </Link>
          <p className="ds-lb-note">
            {waiting === 0 ? "Inbox zero — nobody is waiting" : oldest ? `Oldest has waited ${oldest}` : "New today"}
          </p>
          {needsApproval.count > 0 && (
            <Link prefetch={false} href={needsApproval.href} className="ds-lb-flag">
              {needsApproval.count} {needsApproval.count === 1 ? "booking needs" : "bookings need"} approval
              <ChevronRight size={14} aria-hidden />
            </Link>
          )}
        </div>
        {items.length > 0 && (
          <ul className="ds-lb-inbox">
            {items.map((r, i) => (
              <li key={r.id} className="ds-rise" style={rise(i + 2)}>
                <Link prefetch={false} href={`/app/requests/${r.id}`} className="ds-lb-letter">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold">{r.name}</span>
                    <span className="block truncate text-[13px] opacity-75">{r.title}</span>
                  </span>
                  <span className={`ds-lb-age ${r.approval ? "is-alert" : ""}`}>{r.approval ? "Approve" : r.age}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
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
    <Shell>
      <div className="ds-lb-grid">
        <div className="min-w-0">
          <p className="ds-lb-label">Out for signature</p>
          <Link prefetch={false} href={outHref} className="ds-lb-big">
            <CountUp value={out} />
          </Link>
          <p className="ds-lb-note">
            {out === 0 ? "Nothing waiting on a client" : oldest ? `Oldest sent ${oldest} ago` : "Sent today"}
          </p>
        </div>
        <Side title="Last 30 days">
          <SideLink href={signedHref} label="Signed" value={signed30} />
          <SideLink href={draftsHref} label="Drafts" value={drafts} />
        </Side>
      </div>
    </Shell>
  );
}
