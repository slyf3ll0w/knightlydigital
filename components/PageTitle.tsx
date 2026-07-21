import type { LucideIcon } from "lucide-react";
import { SECTION_HUES, type SectionKey } from "@/lib/section-colors";

/**
 * Page heading with the section's icon tile — the same rounded hue tile the
 * More/Create sheets use, so landing on a page continues the nav's color
 * language instead of dropping to gray.
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
    <h1 className="numeral-ledger flex items-center gap-2.5 text-2xl font-semibold text-gray-900">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          backgroundColor: `${hue}1c`,
          color: hue,
          boxShadow: `inset 0 0 0 1.5px ${hue}30`,
        }}
        aria-hidden
      >
        <Icon size={18} strokeWidth={2} />
      </span>
      {children}
    </h1>
  );
}
