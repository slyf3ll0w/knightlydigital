import Link from "next/link";
import { hueInk } from "@/lib/section-colors";

/**
 * Filter rail + chips shared by every list page. One horizontal row that
 * scrolls edge-to-edge on phones (never wraps). Raised = clickable, pressed
 * = selected: inactive chips sit proud on the hard tool offset like every
 * other button, while the active filter is a solid section-hue block pushed
 * flat with an inset lip (.chip-pressed).
 */

export function FilterRow({ children }: { children: React.ReactNode }) {
  // py-1 keeps the 2px offset shadow from being clipped by overflow-x
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
      {children}
    </div>
  );
}

export function FilterDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden />;
}

export function FilterChip({
  hue,
  active,
  href,
  onClick,
  children,
}: {
  hue: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const base =
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 py-1.5 text-sm transition-all";
  const cls = active
    ? `${base} chip-pressed font-semibold`
    : `${base} btn-tool-line bg-white font-medium text-gray-600 hover:text-gray-900`;
  const style = active ? { backgroundColor: hue, color: hueInk(hue) } : undefined;

  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} style={style}>
      {children}
    </button>
  );
}
