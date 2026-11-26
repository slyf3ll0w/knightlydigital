import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The client portal's kit in the app's new look (2026-11-25, David: "redesign
 * the client portal, more like the app improvements"). Styles in
 * hub-heavy.css:
 * - phones: Apple's grouped look — gray page, white rounded cards, rows with
 *   hairlines that start after the leading piece, chevrons, press highlight,
 *   statuses as a colored dot and a gray word;
 * - desktop: the app's open pages — a white page, sections under a bold
 *   title with the two-color bar (band color, then accent), hairline rows.
 * Server-safe (no hooks), so every portal page and /client-preview share it.
 */

export type HubTone = "good" | "warn" | "bad" | "info" | "neutral";

/** A status as a colored dot and a plain word. */
export function HubStatus({ tone, label }: { tone: HubTone; label: string }) {
  return (
    <span className={`hk-status is-${tone}`}>
      <i aria-hidden />
      {label}
    </span>
  );
}

/** The page's own title: a large title, a one-line note, an optional main action. */
export function HubPageHead({
  title,
  note,
  action,
}: {
  title: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="hk-head">
      <div className="min-w-0">
        <h1 className="hk-title">{title}</h1>
        {note ? <p className="hk-note">{note}</p> : null}
      </div>
      {action ? <div className="hk-head-action">{action}</div> : null}
    </header>
  );
}

/** A section: its title (with the two-color bar on desktop) over one card of rows. */
export function HubGroup({
  title,
  count,
  aside,
  children,
  className = "",
  style,
  flush = false,
}: {
  title?: React.ReactNode;
  count?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Rows sit straight in the card (no inner padding) — the default for lists. */
  flush?: boolean;
}) {
  return (
    <section className={`hk-group ${className}`} style={style}>
      {title ? (
        <div className="hk-group-head">
          <h2 className="hk-h2">
            <span className="hk-h2-text">{title}</span>
            {count !== undefined && count !== null ? <span className="hk-h2-n">{count}</span> : null}
          </h2>
          {aside ? <div className="hk-group-aside">{aside}</div> : null}
        </div>
      ) : null}
      <div className={`hk-card${flush ? "" : " is-pad"}`}>{children}</div>
    </section>
  );
}

/** One row: an optional leading piece, title + sub line, a value on the right, a chevron when it opens something. */
export function HubRow({
  href,
  lead,
  title,
  sub,
  value,
  status,
  chevron,
  external = false,
}: {
  href?: string;
  lead?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  status?: { tone: HubTone; label: string } | null;
  /** Defaults to true when the row is a link. */
  chevron?: boolean;
  external?: boolean;
}) {
  const body = (
    <>
      {lead ? <span className="hk-lead">{lead}</span> : null}
      <span className="hk-row-text">
        <span className="hk-row-title">{title}</span>
        {sub ? <span className="hk-row-sub">{sub}</span> : null}
      </span>
      {value !== undefined || status ? (
        <span className="hk-row-end">
          {value !== undefined ? <span className="hk-row-value hh-num">{value}</span> : null}
          {status ? <HubStatus tone={status.tone} label={status.label} /> : null}
        </span>
      ) : null}
      {(chevron ?? Boolean(href)) ? <ChevronRight size={17} strokeWidth={2.4} className="hk-chev" aria-hidden /> : null}
    </>
  );
  if (!href) return <div className={`hk-row${lead ? " has-lead" : ""}`}>{body}</div>;
  return external ? (
    <a href={href} className={`hk-row is-link${lead ? " has-lead" : ""}`}>
      {body}
    </a>
  ) : (
    <Link href={href} className={`hk-row is-link${lead ? " has-lead" : ""}`}>
      {body}
    </Link>
  );
}

/** A small date tile (month over day) as a row's leading piece. */
export function HubDate({ month, day }: { month: string; day: string }) {
  return (
    <span className="hk-date" aria-hidden>
      <span className="hk-date-m">{month}</span>
      <span className="hk-date-d">{day}</span>
    </span>
  );
}

/** An empty card: one plain sentence, an optional next step. */
export function HubEmpty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="hk-card is-pad hk-empty">
      <p className="hk-empty-title">{title}</p>
      {body ? <p className="hk-empty-body">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
