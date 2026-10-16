"use client";

/**
 * One tap-to-pick chip, for rows of choices that used to be pickers and
 * dropdowns (days, lengths). Toggle-button semantics (aria-pressed) so a
 * screen reader hears which one is on. Colors ride the company primary
 * through the ds tokens; gray classes go through the theme bridge.
 */
export default function OptionChip({
  active,
  onClick,
  children,
  className = "",
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] text-gray-900 ring-1 ring-[color:var(--ds-primary)]"
          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** A row of chips that scrolls sideways on a phone instead of wrapping into a wall. */
export function ChipRow({ children, ariaLabel }: { children: React.ReactNode; ariaLabel?: string }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </div>
  );
}
