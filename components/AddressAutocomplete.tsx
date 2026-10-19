"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AddressSuggestion } from "@/lib/geocoding";

/**
 * A street-address input that offers real, USPS-form addresses as you type
 * (Mapbox, via /api/app/line/address-suggest) and hands the picked one back
 * as street / city / state / ZIP. The carrier registry rejects addresses
 * USPS doesn't recognise, and every re-file costs a fee, so the form steers
 * toward a standardised address instead of free text. Typing without picking
 * still works — it's a hint, not a gate.
 *
 * The list is portaled to <body> and placed under the field by measuring it
 * (David 2026-10-19): drawn inside the field's own box it was clipped by
 * every scrolling sheet and modal (overflow on .modal-card), so on the phone
 * it was simply never seen. It follows the field through scrolls and
 * resizes while open.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onPick,
  className,
  placeholder,
  required,
  endpoint = "/api/app/line/address-suggest",
  id,
  ariaLabel,
  disabled,
  maxLength,
  dark = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onPick: (s: AddressSuggestion) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  /**
   * Where suggestions come from. The default is the texting registration's
   * manager-only route; staff forms use /api/app/geocode/suggest (anyone
   * signed in), public forms /api/public/address-suggest?slug=….
   */
  endpoint?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  maxLength?: number;
  /** Public forms on a dark appearance — the list matches the field */
  dark?: boolean;
}) {
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  // The suggestion last picked — a form may put its street OR its full label in the box
  const picked = useRef<AddressSuggestion | null>(null);
  const abort = useRef<AbortController | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    const justPicked = picked.current && (picked.current.street === value || picked.current.label === value);
    if (disabled || q.length < 3 || justPicked) {
      setItems([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(() => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((j: { suggestions?: AddressSuggestion[] }) => {
          if (ctrl.signal.aborted) return;
          const next = j.suggestions ?? [];
          setItems(next);
          setOpen(next.length > 0);
          setActive(next.length > 0 ? 0 : -1);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [value, endpoint, disabled]);

  // Outside tap closes the list — the list itself (portaled) counts as inside
  useEffect(() => {
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || list.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  // Where the list goes: just under the field, in document coordinates
  const place = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Any scroller (the page, a sheet, a modal body) moves the field; so does the keyboard
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, items.length, place]);

  const choose = (s: AddressSuggestion) => {
    picked.current = s;
    setOpen(false);
    setItems([]);
    onPick(s);
  };

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            style={{ position: "absolute", top: box.top, left: box.left, width: box.width }}
            className={`app-ui ds z-[95] max-h-60 overflow-auto rounded-xl py-1 text-sm shadow-lg ${
              dark ? "border border-white/15 bg-[#161a16]" : "ds-glass border border-black/10 bg-white/95"
            }`}
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
                className={`cursor-pointer px-3 py-2 ${
                  dark
                    ? i === active ? "bg-white/10 text-white" : "text-white/85"
                    : i === active ? "bg-gray-100 text-gray-900" : "text-gray-700"
                }`}
              >
                <span className="font-medium">{s.street}</span>
                <span className={dark ? "text-white/50" : "text-gray-500"}>
                  , {s.city}, {s.state} {s.postalCode}
                </span>
              </li>
            ))}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={wrap} className="relative">
      <input
        id={id}
        aria-label={ariaLabel}
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
        disabled={disabled}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {menu}
    </div>
  );
}
