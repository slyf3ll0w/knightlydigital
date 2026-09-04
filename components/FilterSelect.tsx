"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Check, ChevronDown, ListFilter } from "lucide-react";

/**
 * Phone-only filter dropdown for list pages with too many statuses for a
 * segmented row (Quotes' seven wrapped onto two rows; Requests' five needed
 * 12px type). One compact trigger showing the active filter; tap for a menu
 * of every option. When a non-default filter is applied the trigger takes
 * the SECONDARY brand accent so it's obvious the list is filtered.
 * Desktop keeps the chip rail — pages gate this behind lg:hidden.
 */
export type FilterOption = { value: string; label: string; href: string };

export default function FilterSelect({
  options,
  value,
  className = "",
  icon = "filter",
  align = "left",
}: {
  options: FilterOption[];
  value: string;
  className?: string;
  /** "sort" swaps the funnel for an up/down arrow — same control, used for
   *  the sort menu on every list page (see FilterBar). */
  icon?: "filter" | "sort";
  /** Which edge the menu hangs from; "right" for a trigger at the far right. */
  align?: "left" | "right";
}) {
  const Icon = icon === "sort" ? ArrowUpDown : ListFilter;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const active = options.find((o) => o.value === value) ?? options[0];
  const filtered = active.value !== options[0].value;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 rounded-[12px] border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
          filtered ? "border-transparent" : "border-gray-200 bg-gray-100 text-gray-800"
        }`}
        style={
          filtered
            ? {
                backgroundColor: "var(--mobile-accent, #0b57d8)",
                color: "var(--mobile-on-accent, #ffffff)",
              }
            : undefined
        }
      >
        <Icon size={14} className={filtered ? "" : "text-gray-500"} />
        {active.label}
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""} ${
            filtered ? "" : "text-gray-500"
          }`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className={`sheet-material absolute top-full z-30 mt-1 w-max min-w-[12rem] whitespace-nowrap rounded-lg border border-gray-200 py-1.5 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const isActive = o.value === active.value;
            return (
              <Link
                key={o.value}
                href={o.href}
                role="option"
                aria-selected={isActive}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-8 px-3.5 py-2 text-sm ${
                  isActive ? "font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {o.label}
                {isActive && (
                  <Check size={15} style={{ color: "var(--mobile-accent, #0b57d8)" }} />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
