import type { LucideIcon } from "lucide-react";
import { SECTION_HUES, type SectionKey, hueInk } from "@/lib/section-colors";
import TitleSentinel from "@/components/TitleSentinel";

/**
 * Page heading with the section's icon tile — solid section hue on a hard
 * navy offset (the marketing site's tool-button language), so each page
 * opens with a piece of the brand world instead of a pale gray heading.
 * On mobile this is the iOS large title: a sentinel reports when it scrolls
 * away so the shell can raise a small title into the blurred header.
 */
export default function PageTitle({
  section,
  icon: Icon,
  children,
}: {
  section: SectionKey;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const hue = SECTION_HUES[section];
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
      <span
        className="chip-tool flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: hue, color: hueInk(hue) }}
        aria-hidden
      >
        <Icon size={18} strokeWidth={2.25} />
      </span>
      {children}
    </h1>
  );
}
