"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AddressSuggestion } from "@/lib/geocoding";

/**
 * A street-address input that offers real, USPS-form addresses as you type
 * (Mapbox, via /api/app/line/address-suggest) and hands the picked one back
 * as street / city / state / ZIP. The carrier registry rejects addresses
 * USPS doesn't recognise, and every re-file costs a fee, so the form steers
 * toward a standardised address instead of free text. Typing without picking
 * still works — it's a hint, not a gate.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onPick,
  className,
  placeholder,
  required,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (s: AddressSuggestion) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (q.length < 4 || picked.current === value) {
      setItems([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      fetch(`/api/app/line/address-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((j: { suggestions?: AddressSuggestion[] }) => {
          if (ctrl.signal.aborted) return;
          const next = j.suggestions ?? [];
          setItems(next);
          setOpen(next.length > 0);
          setActive(next.length > 0 ? 0 : -1);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (s: AddressSuggestion) => {
    picked.current = s.street;
    setOpen(false);
    setItems([]);
    onPick(s);
  };

  return (
    <div ref={wrap} className="relative">
      <input
        value={value}
        onChange={(e) => {
          picked.current = null;
          onChange(e.target.value);
        }}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0 && items[active]) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={className}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="ds-glass absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl py-1 text-sm"
        >
          {items.map((s, i) => (
            <li
              key={s.label}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-gray-100 text-gray-900" : "text-gray-700"}`}
            >
              <span className="font-medium">{s.street}</span>
              <span className="text-gray-500">
                , {s.city}, {s.state} {s.postalCode}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
