"use client";

import { useEffect, useRef, useState } from "react";

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

/**
 * Line-item name input with price-book autocomplete (Jobber-style):
 * type to filter saved products/services, pick one to autofill the line.
 * Free text is always allowed — the price book is a shortcut, not a cage.
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
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const query = value.trim().toLowerCase();
  const matches = query
    ? items.filter((i) => i.name.toLowerCase().includes(query)).slice(0, 6)
    : items.slice(0, 6);

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

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1 overflow-hidden">
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
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium text-gray-900">
                  <span className="truncate">{item.name}</span>
                  {item.recurringInterval && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                      Recurring
                    </span>
                  )}
                </span>
                {item.description && (
                  <span className="block text-xs text-gray-500 truncate">{item.description}</span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold text-gray-700">
                ${Number(item.unitPrice).toFixed(2)}
                {item.recurringInterval && (
                  <span className="text-xs font-normal text-gray-400">
                    {INTERVAL_SHORT[item.recurringInterval]}
                  </span>
                )}
              </span>
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              Pick an item to autofill, or keep typing a custom name
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
