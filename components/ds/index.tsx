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
import type { LucideIcon } from "lucide-react";
import Arrow from "./Arrow";
import InfoTip from "./InfoTip";

export { InfoTip, Arrow };

type Tone = "primary" | "secondary" | "good" | "warn" | "bad" | "neutral";

/** The page container: turns the design system on for everything inside. */
export function DsPage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ds mx-auto w-full max-w-6xl px-4 pb-10 pt-4 lg:px-8 lg:pt-8 ${className}`}>{children}</div>;
}

/** Page header: eyebrow (context like a date), title, optional (i), actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  info,
  actions,
  className = "",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  info?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ds-rise flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="ds-eyebrow">{eyebrow}</p>}
        <h1 className="ds-title mt-1 flex items-center gap-2">
          <span className="min-w-0">{title}</span>
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
}: {
  children: React.ReactNode;
  href?: string;
  raised?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cls = `ds-card ${raised ? "ds-card-raised" : ""} ${className}`;
  return href ? (
    <Link prefetch={false} href={href} className={`block ${cls}`} style={style}>
      {children}
    </Link>
  ) : (
    <div className={cls} style={style}>
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
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "soft" | "outline" | "ghost";
  size?: "sm" | "lg";
  icon?: LucideIcon;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const cls = `ds-btn ds-btn-${variant} ${size ? `ds-btn-${size}` : ""} ${className}`;
  const inner = (
    <>
      {Icon && <Icon size={size === "sm" ? 15 : 17} strokeWidth={2.2} aria-hidden />}
      {children}
    </>
  );
  return href ? (
    <Link prefetch={false} href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={cls} {...rest}>
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
