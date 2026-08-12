import Link from "next/link";

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
    <div className="no-scrollbar scroll-fade-x -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
      {children}
    </div>
  );
}

/**
 * Phone-only segmented control — every option visible at once, no sideways
 * scrolling (David's ask: the chip rail hid filters off-screen). One track,
 * equal-width segments; the active one takes the SECONDARY brand accent
 * (interactive things = secondary, per the allocation rule). Desktop keeps
 * the chip rail.
 */
export function SegmentedRow({
  children,
  className = "",
  cols,
}: {
  children: React.ReactNode;
  className?: string;
  /** Wrap onto multiple rows of this many columns (pages with 6+ filters) —
      still no sideways scrolling, everything stays visible. */
  cols?: number;
}) {
  return (
    <div
      className={`grid gap-1 rounded-[12px] border border-gray-200 bg-gray-100 p-1 text-[13px] ${
        cols ? "" : "auto-cols-fr grid-flow-col"
      } ${className}`}
      style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
    >
      {children}
    </div>
  );
}

export function Segment({
  active,
  href,
  onClick,
  children,
}: {
  active: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  // Text size comes from the SegmentedRow track (13px default) so dense
  // pages can shrink every segment at once
  const base =
    "flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-[9px] px-1 py-1.5 transition-all";
  const cls = active
    ? `${base} font-semibold shadow-[0_1px_3px_rgba(9,13,19,0.18)]`
    : `${base} font-medium text-gray-600 active:opacity-70`;
  const style = active
    ? {
        backgroundColor: "var(--mobile-accent, #0b57d8)",
        color: "var(--mobile-on-accent, #ffffff)",
      }
    : undefined;

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

export function FilterDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden />;
}

export function FilterChip({
  hue: _hue,
  active,
  href,
  onClick,
  children,
}: {
  /** Accepted for call-site compat; the active fill is the ONE tenant
   *  accent via .chip-pressed now, not a per-section hue. */
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

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
