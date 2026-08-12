import type { LucideIcon } from "lucide-react";
import type { SectionKey } from "@/lib/section-colors";
import TitleSentinel from "@/components/TitleSentinel";

/**
 * Page heading — clean ledger type, no ornament. (The old section-hue icon
 * tile was one of fifteen accent colors fighting the tenant's brand; the
 * calm-stage pass retired it. `section`/`icon` stay in the signature so the
 * fifteen call sites didn't need touching — the hue rainbow now lives only
 * in the two mobile nav sheets.)
 * On mobile this is the iOS large title: a sentinel reports when it scrolls
 * away so the shell can raise a small title into the bar — and the desktop
 * top bar now does the same collapse.
 */
export default function PageTitle({
  children,
  rule = true,
}: {
  /** Optional since the calm-stage pass — kept for old call sites. */
  section?: SectionKey;
  icon?: LucideIcon;
  /** Set false where text sits tight under the title (the rule would overlap) */
  rule?: boolean;
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
    <h1 className="numeral-ledger relative flex items-center gap-3 text-[26px] font-bold text-gray-900 lg:text-2xl lg:font-semibold">
      {text && <TitleSentinel title={text} />}
      {children}
      {/* The top bar's primary→accent margin rule, in miniature — draws in
          under the title as the page lands (globals.css .title-rule) */}
      {rule && <span aria-hidden className="title-rule" />}
    </h1>
  );
}
