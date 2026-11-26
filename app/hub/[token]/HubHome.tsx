import { Fragment } from "react";
import Link from "next/link";
import { PORTAL_SECTIONS, type PortalSectionId } from "@/lib/client-theme-spec";
import { FileText, Mail, MessageCircle, Receipt, CalendarDays, Inbox } from "lucide-react";
import { money } from "@/lib/statuses";
import ResendContractButton from "./ResendContractButton";
import HubCountUp from "./HubCountUp";
import { HubDate, HubGroup, HubRow } from "./HubKit";

/**
 * The client portal home in the app's new look (2026-11-25). The band
 * continues from the shell into a hero: "Hi <first name>" with the name in
 * the accent, one true line about what's waiting, and the ONE thing to do as
 * the accent button (Pay, Review quote, Open messages, Ask for work) with a
 * quiet second button. Below: what still needs them, the money, what's
 * coming, then the history and the request form, as grouped rows (phones)
 * or open sections (desktop). Pure: page.tsx loads the data, /client-preview
 * feeds the fake Brightwire Electric through the same component.
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

/** Sections rise in one after another (`--i` = their place). */
const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

type Action = { label: string; href: string };

/** The hero's line and its two buttons, from what is waiting (most urgent first). */
function heroFor(d: HubHomeData): { note: string; main: Action; second: Action | null } {
  const ask: Action = { label: d.form.buttonLabel, href: `${d.base}/requests/new` };
  const messages: Action = { label: "Open messages", href: `${d.base}/messages` };
  const next = d.visits[0];
  if (d.balance) {
    const b = d.balance;
    const main: Action = {
      label: b.payable ? (b.count === 1 ? `Pay ${money(b.amount)}` : "Pay invoices") : b.count === 1 ? "View invoice" : "View invoices",
      href: b.href,
    };
    const second: Action = d.quote
      ? { label: d.quote.count === 1 ? "Review quote" : "Review quotes", href: d.quote.href }
      : d.unread
        ? messages
        : ask;
    return { note: b.due ? `${b.what} · ${b.due}` : `${b.what} to pay`, main, second };
  }
  if (d.quote) {
    return {
      note: d.quote.count === 1 ? "A quote is waiting for your approval" : `${d.quote.count} quotes are waiting for your approval`,
      main: { label: d.quote.count === 1 ? "Review quote" : "Review quotes", href: d.quote.href },
      second: d.unread ? messages : ask,
    };
  }
  if (d.pendingContracts.length > 0) {
    return {
      note:
        d.pendingContracts.length === 1
          ? "An agreement is waiting for your signature"
          : `${d.pendingContracts.length} agreements are waiting for your signature`,
      main: d.unread ? messages : ask,
      second: next ? { label: "See visits", href: `${d.base}/visits` } : null,
    };
  }
  if (d.unread) {
    return {
      note: d.unread.count === 1 ? `A new message from ${d.companyName}` : `${d.unread.count} new messages from ${d.companyName}`,
      main: messages,
      second: ask,
    };
  }
  if (next) {
    return {
      note: `Your next visit is ${next.month} ${next.day}`,
      main: ask,
      second: { label: "See visits", href: `${d.base}/visits` },
    };
  }
  return { note: "Nothing due. You're all set.", main: ask, second: { label: "Invoices and receipts", href: `${d.base}/invoices` } };
}

export default function HubHome({
  d,
  sections = PORTAL_SECTIONS,
  firstName,
  welcome = null,
}: {
  d: HubHomeData;
  /** Section order from the page-designer theme (already pinned by portalSectionOrder); default = today's order. */
  sections?: readonly PortalSectionId[];
  /** The client's first name, in the accent in the greeting. */
  firstName?: string;
  /** The page-designer theme's welcome line under the greeting. */
  welcome?: string | null;
}) {
  const order = sections;
  const nextVisit = d.visits[0];
  const laterVisits = d.visits.slice(1);
  const hero = heroFor(d);

  // What still needs them, in the order a client acts on it (the balance has its own section)
  const todo: React.ReactNode[] = [];
  if (d.quote) {
    todo.push(
      <HubRow
        key="quote"
        href={d.quote.href}
        lead={<span className="hk-ic"><FileText size={17} strokeWidth={2.2} /></span>}
        title={d.quote.count === 1 ? d.quote.title : `${d.quote.count} quotes to approve`}
        sub={d.quote.count === 1 ? "Quote to approve" : d.quote.title}
        value={d.quote.total != null ? money(d.quote.total) : undefined}
      />
    );
  }
  if (d.pendingContracts.length > 0) {
    const c = d.pendingContracts[0];
    todo.push(
      <div key="sign" className="hk-row has-lead">
        <span className="hk-lead">
          <span className="hk-ic"><Mail size={17} strokeWidth={2.2} /></span>
        </span>
        <span className="hk-row-text">
          <span className="hk-row-title">
            {d.pendingContracts.length === 1 ? c.title : `${d.pendingContracts.length} agreements to sign`}
          </span>
          <span className="hk-row-sub">We emailed you the signing link</span>
        </span>
        <span className="hk-row-end">
          <ResendContractButton token={d.token} contractId={c.id} />
        </span>
      </div>
    );
  }
  if (d.unread) {
    todo.push(
      <HubRow
        key="msg"
        href={`${d.base}/messages`}
        lead={<span className="hk-ic"><MessageCircle size={17} strokeWidth={2.2} /></span>}
        title={d.unread.count === 1 ? `New message from ${d.companyName}` : `${d.unread.count} new messages`}
        sub={d.unread.preview ?? "Open messages"}
      />
    );
  }
  if (nextVisit) {
    todo.push(
      <HubRow
        key="visit"
        href={`${d.base}/visits`}
        lead={<HubDate month={nextVisit.month} day={nextVisit.day} />}
        title={nextVisit.title}
        sub={`Next visit · ${nextVisit.when}`}
      />
    );
  }

  const history = [
    { href: `${d.base}/invoices`, label: "Invoices and receipts", icon: Receipt },
    { href: `${d.base}/quotes`, label: "Quotes", icon: FileText },
    { href: `${d.base}/visits`, label: "Visits", icon: CalendarDays },
    { href: `${d.base}/requests`, label: "Requests", icon: Inbox },
  ];

  let i = 1;
  // Each section renders in the theme's order (lib/client-theme-spec.ts portalSectionOrder):
  // Balance due and the to-do rows always first; the rest may be moved or hidden.
  const render: Record<PortalSectionId, () => React.ReactNode> = {
    balance: () =>
      d.balance ? (
        <HubGroup title="Balance due" className="hh-rise" style={rise(i++)}>
          <div className="hk-money">
            <div className="min-w-0">
              <HubCountUp value={d.balance.amount} className="hk-big hh-num block" />
              <p className="hk-money-sub">
                {d.balance.what}
                {d.balance.due ? (
                  <>
                    {" · "}
                    <span className={d.balance.overdue ? "hk-late" : ""}>{d.balance.due}</span>
                  </>
                ) : null}
              </p>
            </div>
            <Link href={d.balance.href} className="hh-btn hk-money-btn">
              {d.balance.payable ? (d.balance.count === 1 ? "Pay now" : "See invoices") : d.balance.count === 1 ? "View invoice" : "See invoices"}
            </Link>
          </div>
        </HubGroup>
      ) : null,
    todo: () =>
      todo.length > 0 ? (
        <HubGroup title="Waiting on you" count={todo.length} flush className="hh-rise" style={rise(i++)}>
          {todo}
        </HubGroup>
      ) : !d.balance ? (
        <HubGroup className="hh-rise" style={rise(i++)}>
          <p className="hk-empty-title">You&apos;re all caught up</p>
          <p className="hk-empty-body">Nothing needs you right now.</p>
        </HubGroup>
      ) : null,
    requestWork: () => (
      <HubGroup title={d.form.heading} className="hh-rise" style={rise(i++)}>
        <div className="hk-ask">
          <p className="hk-ask-body">{d.form.description}</p>
          <Link href={`${d.base}/requests/new`} className="hh-btn-2">
            {d.form.buttonLabel}
          </Link>
        </div>
      </HubGroup>
    ),
    comingUp: () =>
      laterVisits.length > 0 ? (
        <HubGroup title="Coming up" count={laterVisits.length} flush className="hh-rise" style={rise(i++)}>
          {laterVisits.map((v) => (
            <HubRow key={v.id} lead={<HubDate month={v.month} day={v.day} />} title={v.title} sub={v.when} />
          ))}
        </HubGroup>
      ) : null,
    completedWork: () =>
      d.recentWork.length > 0 ? (
        <HubGroup
          title="Completed work"
          flush
          className="hh-rise"
          style={rise(i++)}
          aside={
            <Link href={`${d.base}/work`} className="hk-link">
              See all
            </Link>
          }
        >
          {d.recentWork.map((w) => (
            <HubRow
              key={w.id}
              href={`${d.base}/work/${w.id}`}
              lead={
                w.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.thumb} alt="" className="hk-thumb" />
                ) : (
                  <HubDate month={w.month ?? ""} day={w.day ?? "·"} />
                )
              }
              title={w.title}
              sub={w.when}
            />
          ))}
        </HubGroup>
      ) : null,
    agreements: () =>
      d.signedContracts.length > 0 ? (
        <HubGroup title="Agreements" flush className="hh-rise" style={rise(i++)}>
          {d.signedContracts.map((c) => (
            <HubRow key={c.id} title={c.title} sub={c.when ? `Signed ${c.when}` : undefined} status={{ tone: "good", label: "Signed" }} />
          ))}
        </HubGroup>
      ) : null,
    records: () => (
      <HubGroup title="Your records" flush className="hh-rise" style={rise(i++)}>
        {history.map((h) => (
          <HubRow
            key={h.href}
            href={h.href}
            lead={
              <span className="hk-ic is-quiet">
                <h.icon size={17} strokeWidth={2.2} />
              </span>
            }
            title={h.label}
          />
        ))}
      </HubGroup>
    ),
  };

  return (
    <div className="hh-home">
      {/* The band, continued: the greeting and the one thing to do */}
      <section className="hh-hero">
        <div className="hh-hero-in">
          <h1 className="hh-hi">
            Hi
            {firstName ? (
              <>
                {" "}
                <span className="hh-hi-name">{firstName}</span>
              </>
            ) : null}
          </h1>
          {welcome ? <p className="hh-welcome">{welcome}</p> : null}
          <p className="hh-hero-note">{hero.note}</p>
          <div className="hh-hero-acts">
            <Link href={hero.main.href} className="hh-hero-main">
              {hero.main.label}
            </Link>
            {hero.second ? (
              <Link href={hero.second.href} className="hh-hero-ghost">
                {hero.second.label}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
      <div className="hh-home-body">
        {order.map((id) => (
          <Fragment key={id}>{render[id]()}</Fragment>
        ))}
      </div>
    </div>
  );
}
