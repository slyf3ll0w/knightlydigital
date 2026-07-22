import type { LucideIcon } from "lucide-react";
import { SECTION_HUES, type SectionKey } from "@/lib/section-colors";
import { textOn } from "@/lib/branding";

/**
 * Page heading with the section's icon tile — solid section hue on a hard
 * navy offset (the marketing site's tool-button language), so each page
 * opens with a piece of the brand world instead of a pale gray heading.
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
  return (
    <h1 className="numeral-ledger flex items-center gap-3 text-2xl font-semibold text-gray-900">
      <span
        className="chip-tool flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: hue, color: textOn(hue) }}
        aria-hidden
      >
        <Icon size={18} strokeWidth={2.25} />
      </span>
      {children}
    </h1>
  );
}
