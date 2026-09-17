import type { LucideIcon } from "lucide-react";
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
 */
export default function PageTitle({
  children,
  sub,
  className,
}: {
  /** Optional since the calm-stage pass — kept for old call sites. */
  section?: SectionKey;
  icon?: LucideIcon;
  /** No-op since the title rule was retired; kept for old call sites. */
  rule?: boolean;
  /** One-line description shown under the rule, in the page's muted ink. */
  sub?: React.ReactNode;
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
      <h1 className="numeral-ledger flex items-center gap-3 text-[26px] font-bold text-gray-900 lg:text-2xl lg:font-semibold">
        {text && <TitleSentinel title={text} />}
        {children}
      </h1>
      {sub && (
        <p className="mt-1.5 max-w-prose text-sm leading-snug text-gray-500">
          {sub}
        </p>
      )}
    </div>
  );
}
