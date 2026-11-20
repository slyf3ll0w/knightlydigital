import Link from "next/link";
import { ChevronRight, Mail } from "lucide-react";
import { money } from "@/lib/statuses";
import ResendContractButton from "./ResendContractButton";
import HubCountUp from "./HubCountUp";

/**
 * The client portal home in the heavy look. Leads with what the client has
 * to do — a balance to pay, a quote to approve, an agreement to sign, a
 * message to read, the next visit — as solid cards, then the history.
 * Pure: page.tsx loads the data, /client-preview feeds the fake Brightwire
 * Electric through the same component.
 */

export type HubHomeData = {
  token: string;
  base: string;
  companyName: string;
  balance: {
    amount: number;
    /** Open invoices behind the balance. */
    count: number;
    /** One open invoice: its pay page. Several: the Invoices tab. */
    href: string;
    /** "Invoice 1042" or "2 invoices". */
    what: string;
    /** "Due December 4" / "Past due since November 2" / null. */
    due: string | null;
    overdue: boolean;
    /** False when the company can't take online payments: the button views. */
    payable: boolean;
  } | null;
  quote: { count: number; title: string; total: number | null; href: string } | null;
  pendingContracts: { id: string; title: string }[];
  unread: { count: number; preview: string | null } | null;
  /** Today onward, soonest first. */
  visits: { id: string; title: string; month: string; day: string; when: string }[];
  recentWork: { id: string; title: string; when: string; thumb: string | null; month: string | null; day: string | null }[];
  signedContracts: { id: string; title: string; when: string }[];
  form: { heading: string; description: string; buttonLabel: string };
};

/** Cards rise in one after another (`--i` = their place). */
const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default function HubHome({ d }: { d: HubHomeData }) {
  const nextVisit = d.visits[0];
  const laterVisits = d.visits.slice(1);

  // The "to do" cards below the balance, in the order a client acts on them
  const todo: React.ReactNode[] = [];
  if (d.quote) {
    todo.push(
      <div key="quote" className="hh-card p-5 flex flex-1 flex-col">
        <p className="hh-label">{d.quote.count === 1 ? "Quote to approve" : `${d.quote.count} quotes to approve`}</p>
        <p className="hh-title mt-2 truncate">{d.quote.title}</p>
        {d.quote.total != null ? <p className="hh-num mt-1 text-[22px] font-bold text-[color:var(--hh-ink)]">{money(d.quote.total)}</p> : null}
        <div className="mt-auto pt-5">
          <Link href={d.quote.href} className="hh-btn">
            {d.quote.count === 1 ? "Review quote" : "Review quotes"}
          </Link>
        </div>
      </div>
    );
  }
  if (nextVisit) {
    todo.push(
      <Link key="visit" href={`${d.base}/visits`} className="hh-card p-5 flex flex-1 flex-col">
        <p className="hh-label">Next visit</p>
        <div className="mt-3 flex items-center gap-4">
          <div className="hh-date" aria-hidden>
            <span className="hh-date-m">{nextVisit.month}</span>
            <span className="hh-date-d">{nextVisit.day}</span>
          </div>
          <div className="min-w-0">
            <p className="hh-title truncate">{nextVisit.title}</p>
            <p className="hh-line mt-0.5">{nextVisit.when}</p>
          </div>
        </div>
      </Link>
    );
  }
  if (d.pendingContracts.length > 0) {
    todo.push(
      <div key="sign" className="hh-card p-5 flex flex-1 flex-col">
        <p className="hh-label">
          {d.pendingContracts.length === 1 ? "Agreement to sign" : `${d.pendingContracts.length} agreements to sign`}
        </p>
        <p className="hh-title mt-2 truncate">{d.pendingContracts[0].title}</p>
        <p className="hh-line mt-1 flex items-center gap-1.5">
          <Mail size={14} className="shrink-0" /> We emailed you the signing link
        </p>
        <div className="mt-auto pt-4">
          <ResendContractButton token={d.token} contractId={d.pendingContracts[0].id} />
        </div>
      </div>
    );
  }
  if (d.unread) {
    todo.push(
      <Link key="msg" href={`${d.base}/messages`} className="hh-card p-5 flex flex-1 flex-col">
        <p className="hh-label">{d.unread.count === 1 ? "New message" : `${d.unread.count} new messages`}</p>
        <p className="hh-title mt-2">{d.companyName}</p>
        {d.unread.preview ? <p className="hh-line mt-1 line-clamp-2">{d.unread.preview}</p> : null}
        <p className="mt-auto pt-4 flex items-center gap-1 text-[15px] font-bold text-[color:var(--hh-accent)]">
          Open messages <ChevronRight size={16} />
        </p>
      </Link>
    );
  }

  const history = [
    { href: `${d.base}/invoices`, label: "Invoices and receipts" },
    { href: `${d.base}/quotes`, label: "Quotes" },
    { href: `${d.base}/visits`, label: "Visits" },
    { href: `${d.base}/requests`, label: "Requests" },
  ];

  let i = 0;
  return (
    <div className="hh-home space-y-4 lg:space-y-5">
      {/* 1 · What's due — the one big number */}
      {d.balance ? (
        <section className="hh-rise hh-card p-5 lg:p-7" style={rise(i++)}>
          <div className="lg:flex lg:items-end lg:justify-between lg:gap-6">
            <div className="min-w-0">
              <p className="hh-label">Balance due</p>
              <HubCountUp value={d.balance.amount} className="hh-big mt-2 block" />
              <p className="hh-line mt-3 text-[15px]">
                {d.balance.what}
                {d.balance.due ? (
                  <>
                    {" · "}
                    <span className={d.balance.overdue ? "font-semibold text-[color:var(--hh-bad)]" : ""}>{d.balance.due}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="mt-5 lg:mt-0 lg:shrink-0">
              <Link href={d.balance.href} className="hh-btn lg:min-w-[200px]">
                {d.balance.payable ? (d.balance.count === 1 ? "Pay now" : "See invoices") : d.balance.count === 1 ? "View invoice" : "See invoices"}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* 2 · The rest of what needs them — two across on desktop; an odd last card spans */}
      {todo.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:gap-5 lg:grid-cols-2 lg:[&>*:last-child:nth-child(odd)]:col-span-2">
          {todo.map((card, n) => (
            <div key={n} className="hh-rise flex min-w-0 flex-col" style={rise(i++)}>
              {card}
            </div>
          ))}
        </div>
      ) : null}

      {!d.balance && todo.length === 0 ? (
        <section className="hh-rise hh-card p-5 lg:p-7" style={rise(i++)}>
          <p className="hh-title">You&apos;re all caught up</p>
          <p className="hh-line mt-1">Nothing needs you right now.</p>
        </section>
      ) : null}

      {/* 3 · Ask for work */}
      <section className="hh-rise hh-card p-5 lg:p-7 lg:flex lg:items-center lg:justify-between lg:gap-6" style={rise(i++)}>
        <div className="min-w-0">
          <p className="hh-title">{d.form.heading}</p>
          <p className="hh-line mt-1">{d.form.description}</p>
        </div>
        <div className="mt-4 lg:mt-0 lg:shrink-0">
          <Link href={`${d.base}/requests/new`} className="hh-btn-2">
            {d.form.buttonLabel}
          </Link>
        </div>
      </section>

      {/* 4 · History */}
      {laterVisits.length > 0 ? (
        <section className="hh-rise pt-3" style={rise(i++)}>
          <h2 className="hh-section mb-3">Coming up</h2>
          <div className="hh-card overflow-hidden">
            {laterVisits.map((v) => (
              <div key={v.id} className="hh-row">
                <div className="hh-date is-small" aria-hidden>
                  <span className="hh-date-m">{v.month}</span>
                  <span className="hh-date-d">{v.day}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold truncate">{v.title}</p>
                  <p className="hh-line">{v.when}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {d.recentWork.length > 0 ? (
        <section className="hh-rise pt-3" style={rise(i++)}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="hh-section">Completed work</h2>
            <Link href={`${d.base}/work`} className="text-[14px] font-semibold text-[color:var(--hh-accent)] hover:underline">
              See all
            </Link>
          </div>
          <div className="hh-card overflow-hidden">
            {d.recentWork.map((w) => (
              <Link key={w.id} href={`${d.base}/work/${w.id}`} className="hh-row">
                {w.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.thumb} alt="" className="h-12 w-11 shrink-0 rounded-lg bg-gray-100 object-cover" />
                ) : (
                  <div className="hh-date is-small" aria-hidden>
                    <span className="hh-date-m">{w.month ?? ""}</span>
                    <span className="hh-date-d">{w.day ?? "·"}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold truncate">{w.title}</p>
                  <p className="hh-line">{w.when}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-gray-400" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {d.signedContracts.length > 0 ? (
        <section className="hh-rise pt-3" style={rise(i++)}>
          <h2 className="hh-section mb-3">Agreements</h2>
          <div className="hh-card overflow-hidden">
            {d.signedContracts.map((c) => (
              <div key={c.id} className="hh-row">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold truncate">{c.title}</p>
                  <p className="hh-line">
                    <span className="font-semibold text-[color:var(--hh-good)]">Signed</span>
                    {c.when ? ` ${c.when}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="hh-rise pt-3" style={rise(i++)}>
        <h2 className="hh-section mb-3">Your records</h2>
        <div className="hh-card overflow-hidden">
          {history.map((h) => (
            <Link key={h.href} href={h.href} className="hh-row">
              <span className="min-w-0 flex-1 text-[15px] font-semibold truncate">{h.label}</span>
              <ChevronRight size={18} className="shrink-0 text-gray-400" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
