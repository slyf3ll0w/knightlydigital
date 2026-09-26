import type { LucideIcon } from "lucide-react";
import InfoTip from "@/components/ds/InfoTip";
import type { SectionKey } from "@/lib/section-colors";
import TitleSentinel from "@/components/TitleSentinel";

/**
 * Page heading — clean ledger type, no ornament. (The old section-hue icon
 * tile was one of fifteen accent colors fighting the tenant's brand; the
 * calm-stage pass retired it. `section`/`icon` stay in the signature so the
 * fifteen call sites didn't need touching — the hue rainbow now lives only
 * in the two mobile nav sheets.)
 *
 * No rule under the heading any more — the animated primary→accent line
 * that drew in on every page landing was retired 2026-09-17 (David didn't
 * like the look). `rule` stays in the signature so call sites didn't need
 * touching; it does nothing now. Pages with a one-line description pass
 * it as `sub`.
 *
 * On mobile this is the iOS large title: a sentinel reports when it scrolls
 * away so the shell can raise a small title into the bar — and the desktop
 * top bar now does the same collapse.
 *
 * Two kinds of second line (David, 2026-09-25):
 *   - `sub`  — CONTEXT the page needs (the client on a quote, the week on
 *               timesheets, the total on expenses). A muted line, everywhere.
 *   - `info` — an EXPLANATION of what the page is for, in the design-system
 *               InfoTip: hover on desktop, tap on phones (David, 2026-09-26:
 *               explanations always live in an (i), on every screen size).
 */
export default function PageTitle({
  children,
  sub,
  info,
  className,
}: {
  /** Optional since the calm-stage pass — kept for old call sites. */
  section?: SectionKey;
  icon?: LucideIcon;
  /** No-op since the title rule was retired; kept for old call sites. */
  rule?: boolean;
  /** Context line under the title (a name, a date, a total) — shown everywhere. */
  sub?: React.ReactNode;
  /** What the page is for — an (i) bubble on every screen size. */
  info?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  // The collapsed header title needs plain text — take the first string child
  // ("Payments" in <PageTitle>Payments {stamp}</PageTitle>).
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? (children.find((c) => typeof c === "string") as string | undefined)
        : undefined;
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <h1 className="ds-title flex items-center gap-2">
        {text && <TitleSentinel title={text} />}
        {children}
        {info && <InfoTip label="About this page">{info}</InfoTip>}
      </h1>
      {sub && <p className="ds-small mt-1.5 max-w-prose text-[13.5px]">{sub}</p>}
    </div>
  );
}
