"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, PencilLine, Search } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import BottomSheet from "@/components/BottomSheet";

export type PickerWorkItem = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number | string;
  unitCost: number | string | null;
  requiresAgreement?: boolean;
  recurringInterval?: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | null;
};

const INTERVAL_SHORT: Record<string, string> = {
  MONTHLY: "/mo",
  QUARTERLY: "/qtr",
  SEMIANNUAL: "/6mo",
  ANNUAL: "/yr",
};

function ItemLabel({ item }: { item: PickerWorkItem }) {
  return (
    <>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium text-gray-900">
          <span className="truncate">{item.name}</span>
          {item.recurringInterval && (
            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-green-100 text-green-700">
              Recurring
            </span>
          )}
        </span>
        {item.description && (
          <span className="block text-xs text-gray-500 truncate">{item.description}</span>
        )}
      </span>
      <span className="numeral-ledger shrink-0 text-sm font-semibold text-gray-700">
        ${Number(item.unitPrice).toFixed(2)}
        {item.recurringInterval && (
          <span className="text-xs font-normal text-gray-400">
            {INTERVAL_SHORT[item.recurringInterval]}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * Line-item name input with price-book autocomplete (Jobber-style):
 * type to filter saved products/services, pick one to autofill the line.
 * Free text is always allowed — the price book is a shortcut, not a cage.
 *
 * On phones the field opens the price book in a bottom sheet WITHOUT
 * focusing the input, so browsing presets never summons the keyboard —
 * it only appears when the user asks to write in a custom item (or the
 * line already carries a custom name).
 */
export default function WorkItemPicker({
  value,
  items,
  onChange,
  onSelect,
  placeholder = "Name (e.g. House Wash)",
  required = false,
}: {
  value: string;
  items: PickerWorkItem[];
  onChange: (text: string) => void;
  onSelect: (item: PickerWorkItem) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false); // desktop dropdown
  const [sheetOpen, setSheetOpen] = useState(false); // phone sheet
  const [sheetQuery, setSheetQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // A line already holding a custom (non-preset) name stays directly typeable
  const [customMode, setCustomMode] = useState(
    () => Boolean(value) && !items.some((i) => i.name === value)
  );
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.trim().toLowerCase();
  const matches = query
    ? items.filter((i) => i.name.toLowerCase().includes(query)).slice(0, 6)
    : items.slice(0, 6);

  const sq = sheetQuery.trim().toLowerCase();
  const sheetMatches = sq
    ? items.filter((i) => i.name.toLowerCase().includes(sq))
    : items;

  // Matches the `lg:` breakpoint the sheet renders under
  const phonePicker = () =>
    items.length > 0 && typeof window !== "undefined" && window.innerWidth < 1024;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(item: PickerWorkItem) {
    onSelect(item);
    setOpen(false);
  }

  function openSheet() {
    setSheetQuery("");
    hapticImpact("LIGHT");
    setSheetOpen(true);
  }

  function pickFromSheet(item: PickerWorkItem) {
    hapticImpact("LIGHT");
    onSelect(item);
    setCustomMode(false);
    setSheetOpen(false);
  }

  function startCustom() {
    setSheetOpen(false);
    setCustomMode(true);
    // Focus inside the tap gesture so the keyboard opens — that's the point:
    // the user just chose to type.
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showBookButton = customMode && items.length > 0;

  return (
    <div className="relative" ref={ref}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onPointerDown={(e) => {
          // Phones browse the price book in a sheet — preventDefault stops
          // the tap from focusing the input, so no keyboard.
          if (!customMode && phonePicker()) {
            e.preventDefault();
            openSheet();
          }
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
          showBookButton ? "pr-9 lg:pr-3" : ""
        }`}
      />
      {/* Custom lines keep a way back into the price book on phones */}
      {showBookButton && (
        <button
          type="button"
          aria-label="Browse saved services"
          onClick={openSheet}
          className="lg:hidden absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-gray-400 active:bg-gray-100"
        >
          <BookOpen size={15} />
        </button>
      )}

      {/* Desktop / hardware-keyboard autocomplete dropdown */}
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 sm:right-auto sm:w-80 sm:max-w-[calc(100vw-2rem)] top-full mt-1 z-40 bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1 max-h-72 overflow-y-auto">
          {matches.map((item, i) => (
            <button
              key={item.id}
              type="button"
              // mousedown (not click) so selection wins over the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                i === highlight ? "bg-green-50" : ""
              }`}
            >
              <ItemLabel item={item} />
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              Pick an item to autofill, or keep typing a custom name
            </span>
          </div>
        </div>
      )}

      {/* Phone price-book sheet — browse and pick without a keyboard */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Products & Services"
      >
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-[12px] bg-black/5 px-3 py-2">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              type="search"
              value={sheetQuery}
              onChange={(e) => setSheetQuery(e.target.value)}
              placeholder="Search your price book..."
              autoComplete="off"
              className="w-full bg-transparent text-[16px] outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
        <div className="max-h-[45dvh] overflow-y-auto overscroll-contain px-2">
          {sheetMatches.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => pickFromSheet(item)}
              className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-[15px] active:bg-black/5"
            >
              <ItemLabel item={item} />
            </button>
          ))}
          {sheetMatches.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">
              No matches in your price book.
            </p>
          )}
        </div>
        <div className="mt-1 border-t sheet-hairline px-2 pt-1">
          <button
            type="button"
            onClick={startCustom}
            className="w-full flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-[15px] font-medium active:bg-black/5"
            style={{ color: "var(--mobile-accent, #0B57D8)" }}
          >
            <PencilLine size={16} />
            {value ? "Edit as a custom item" : "Write in a custom item"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
