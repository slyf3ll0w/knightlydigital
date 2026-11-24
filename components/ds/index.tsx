/**
 * WorkBench design system — the component kit. Every page built on it looks
 * like one app: Lexend, the company's two brand colors, one card, one row,
 * one button, one status chip, explanations in InfoTips, one motion set.
 * Styles live in app/ds.css; the gallery of every piece is /app/design;
 * the rules are in docs/design-system.md.
 *
 * Opt a page in by rendering its content inside <DsPage>.
 */
import Link from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import Arrow from "./Arrow";
import InfoTip from "./InfoTip";

export { InfoTip, Arrow };

type Tone = "primary" | "secondary" | "good" | "warn" | "bad" | "neutral";

const ENTRANCES = ["rise", "slide", "cascade", "settle", "focus"] as const;

/**
 * The page container: turns the design system on for everything inside.
 * `band` (desktop): the branded header (app/ds-brand.css) — the company's
 * primary as a deep band behind the PageHeader with a secondary stripe at its
 * foot, the page opening white underneath. Put the page body in <BandBody>.
 */
export function DsPage({
  children,
  className = "",
  band = false,
  open = false,
  header,
}: {
  children: React.ReactNode;
  className?: string;
  band?: boolean;
  /**
   * The open page without the band (desktop): white page, the page's own
   * header, sections straight on the page. Home wears the band; work pages
   * (Clients, Invoices, …) are open (David 2026-11-24).
   */
  open?: boolean;
  /** With `band`: the page's header, rendered INSIDE the band (so it truly sits on it). */
  header?: React.ReactNode;
}) {
  // Page entrances (David 2026-11-24): one of five is dealt on every page
  // open so loading feels a little different each time; pure CSS (app/ds-brand.css),
  // picked here so the very first paint already carries it — no flash. The
  // browser keeps the server's pick (suppressHydrationWarning).
  const enter = ENTRANCES[Math.floor(Math.random() * ENTRANCES.length)];
  if (open && !band) {
    return (
      <div className="ds bb-wrap bb-open" data-enter={enter} suppressHydrationWarning>
        <div className={`ds bb-page mx-auto w-full max-w-6xl px-4 pb-10 pt-4 lg:px-8 lg:pt-8 ${className}`}>
          {header}
          {children}
        </div>
      </div>
    );
  }
  if (!band) {
    return (
      <div className={`ds mx-auto w-full max-w-6xl px-4 pb-10 pt-4 lg:px-8 lg:pt-8 ${className}`}>
        {header}
        {children}
      </div>
    );
  }
  return (
    <div className="ds bb-wrap" data-enter={enter} suppressHydrationWarning>
      <div className="bb-band">
        <div className="ds bb-page bb-head mx-auto w-full max-w-6xl px-4 pt-4 lg:px-8 lg:pt-8">{header}</div>
      </div>
      <div className={`ds bb-page mx-auto w-full max-w-6xl px-4 pb-10 pt-0 lg:px-8 lg:pt-10 ${className}`}>{children}</div>
    </div>
  );
}

/** Under a band: the page body, starting where the band ends (desktop). */
export function BandBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bb-body ${className}`}>{children}</div>;
}

/**
 * An open section (band pages): a bold title with the two-color bar on a
 * hairline rule, an optional count and right-side action, then its content
 * straight on the page — no card around it.
 */
export function OpenSection({
  title,
  count,
  info,
  aside,
  children,
  className = "",
  style,
  "data-tour": tour,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  info?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  "data-tour"?: string;
}) {
  return (
    <section className={`bb-sec ${className}`} style={style} data-tour={tour}>
      <div className="bb-sec-head">
        <h2 className="bb-h2">
          <span className="bb-h2-text">{title}</span>
          {count !== undefined && count !== null && <span className="bb-h2-n">{count}</span>}
          {info && <InfoTip>{info}</InfoTip>}
        </h2>
        {aside && <div className="bb-sec-aside">{aside}</div>}
      </div>
      <div className="bb-sec-body">{children}</div>
    </section>
  );
}

/** Page header: eyebrow (context like a date), title, optional (i), actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  info,
  actions,
  heavy = false,
  className = "",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** The heavy-look title size/weight (2026-11-21). */
  heavy?: boolean;
  info?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ds-pagehead ds-rise flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="ds-eyebrow ds-eyebrow-plain">{eyebrow}</p>}
        <h1 className={`ds-title ${heavy ? "ds-title-heavy" : ""} mt-1 flex items-center gap-2`}>
          <span className="ds-wipe min-w-0">
            <span className="ds-wipe-text">{title}</span>
            <span className="ds-wipe-bar" aria-hidden />
          </span>
          {info && <InfoTip label="About this page">{info}</InfoTip>}
        </h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title with an optional (i) and a right-side action (link or button). */
export function SectionTitle({
  children,
  info,
  action,
  className = "",
}: {
  children: React.ReactNode;
  info?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="ds-h2 flex items-center gap-1.5">
        {children}
        {info && <InfoTip>{info}</InfoTip>}
      </h2>
      {action}
    </div>
  );
}

/** A text link with an arrow, for "Open schedule →" style actions. */
export function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link prefetch={false} href={href} className="ds-link inline-flex items-center gap-1 text-[13.5px]">
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

/** The one card. Pass `href` to make the whole card a link (hover lift). */
export function Card({
  children,
  href,
  raised = false,
  className = "",
  style,
  "data-testid": testId,
}: {
  children: React.ReactNode;
  href?: string;
  raised?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** for tests: lands on the card's own element */
  "data-testid"?: string;
}) {
  const cls = `ds-card ${raised ? "ds-card-raised" : ""} ${className}`;
  return href ? (
    <Link prefetch={false} href={href} className={`block ${cls}`} style={style} data-testid={testId}>
      {children}
    </Link>
  ) : (
    <div className={cls} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

/** A number that matters: label (+ (i)), big value, a context line, optional chart slot. */
export function Stat({
  label,
  value,
  foot,
  info,
  tone,
  href,
  children,
  className = "",
  style,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  foot?: React.ReactNode;
  info?: React.ReactNode;
  tone?: "bad" | "good";
  href?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const color = tone === "bad" ? "var(--ds-bad)" : tone === "good" ? "var(--ds-good)" : undefined;
  const body = (
    <>
      <p className="ds-label flex items-center gap-1">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </p>
      <p className="ds-value mt-2" style={color ? { color } : undefined}>
        {value}
      </p>
      {foot && <p className="ds-small mt-1.5">{foot}</p>}
      {children}
    </>
  );
  return (
    <Card href={href} className={`p-5 ${className}`} style={style}>
      {body}
    </Card>
  );
}

/** Status tag. Brand tones for normal states, fixed tones for good/warn/bad. */
export function Chip({ tone = "neutral", icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={`ds-chip ds-chip-${tone}`}>
      {Icon && <Icon size={12} strokeWidth={2.4} aria-hidden />}
      {children}
    </span>
  );
}

/** The one button. `href` renders a link styled as a button. */
export function Button({
  children,
  href,
  variant = "primary",
  size,
  icon: Icon,
  loading = false,
  className = "",
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "soft" | "outline" | "ghost";
  size?: "sm" | "lg";
  icon?: LucideIcon;
  /**
   * Busy state: the icon slot becomes a spinning loader, the button is
   * disabled and announced busy. The label stays as is — "Save" keeps
   * reading "Save" so the button never changes width mid-press.
   */
  loading?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const cls = `ds-btn ds-btn-${variant} ${size ? `ds-btn-${size}` : ""} ${className}`;
  const iconSize = size === "sm" ? 15 : 17;
  const inner = (
    <>
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={2.2} className="ds-spin" aria-hidden />
      ) : (
        Icon && <Icon size={iconSize} strokeWidth={2.2} aria-hidden />
      )}
      {children}
    </>
  );
  return href ? (
    <Link prefetch={false} href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {inner}
    </button>
  );
}

/** The one list row: lead (time, count, avatar), title + sub, trailing slot. */
export function ListRow({
  href,
  lead,
  title,
  sub,
  trail,
  className = "",
}: {
  href?: string;
  lead?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  trail?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{title}</span>
        {sub && <span className="ds-small mt-0.5 block truncate">{sub}</span>}
      </span>
      {trail}
    </>
  );
  return href ? (
    <Link prefetch={false} href={href} className={`ds-row ${className}`}>
      {inner}
    </Link>
  ) : (
    <div className={`ds-row ${className}`}>{inner}</div>
  );
}

/**
 * Empty state: one friendly line (+ an (i) for any explanation) and a
 * hand-drawn arrow pointing at the one thing to do next. Functional, not
 * decorative — it disappears once there is data.
 *
 * Layout rule (David, 2026-09-26): decorations get their OWN space. The
 * arrow sits in a fixed 44 x 58 slot between the line and the button, is
 * drawn already pointing down (components/ds/Arrow, a different scribble
 * each time), and is never rotated or absolutely positioned — so it can
 * never land on the text or the button.
 */
export function Hint({
  title,
  info,
  action,
  className = "",
}: {
  title: React.ReactNode;
  info?: React.ReactNode;
  action?: { href: string; label: string; icon?: LucideIcon };
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-9 text-center ${className}`}>
      <p className="flex max-w-xs items-center justify-center gap-1 text-[15px] font-medium text-[color:var(--ds-ink)]">
        <span>{title}</span>
        {info && <InfoTip>{info}</InfoTip>}
      </p>
      {action && (
        <>
          <span className="my-2 block h-[58px] w-[44px] shrink-0 text-[color:var(--ds-ink-2)]" aria-hidden>
            <Arrow delay={0.3} className="h-full w-full" />
          </span>
          <Button href={action.href} icon={action.icon}>
            {action.label}
          </Button>
        </>
      )}
    </div>
  );
}
