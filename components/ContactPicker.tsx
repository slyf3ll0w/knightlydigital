"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import BottomSheet from "@/components/BottomSheet";
import QuickContactSheet from "@/components/QuickContactSheet";

export type PickerContact = {
  id: string;
  firstName: string;
  lastName: string;
  /** What the quick-add sheet saved (a host form can use it as the job site). */
  address?: string | null;
};

const fullName = (c: PickerContact) =>
  `${c.firstName} ${c.lastName}`.trim() || "Unnamed";

// By the name shown, case-insensitively. The feeds order by last name, and a
// lead saved with only a first name has lastName "" — which sorts to the top
// of every dropdown (code audit 2026-10-06 B9).
const byDisplayName = (a: PickerContact, b: PickerContact) =>
  fullName(a).localeCompare(fullName(b), undefined, { sensitivity: "base" });

/**
 * Searchable client selector — replaces the giant native <select> that became
 * unusable once a company had a real client book. Desktop gets an anchored
 * dropdown with a type-to-filter field; phones get a bottom sheet with search
 * (no keyboard until the user taps the search field).
 */
export default function ContactPicker({
  contacts,
  value,
  onChange,
  placeholder = "Select a client…",
  title = "Select a client",
  disabled = false,
  className = "",
  allowCreate = true,
  onCreated,
}: {
  contacts: PickerContact[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  /**
   * "New client" at the foot of the list (and in the empty state) opens a
   * four-field sheet that creates the person and selects them — the form
   * never has to be abandoned to add someone (audit 2026-10-12).
   */
  allowCreate?: boolean;
  /** Told about a client created from the sheet (to merge into a parent list). */
  onCreated?: (c: PickerContact) => void;
}) {
  // People created from the sheet, so they are pickable even when the
  // parent never re-fetches its list.
  const [extra, setExtra] = useState<PickerContact[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const all = useMemo(() => {
    const seen = new Set(contacts.map((c) => c.id));
    return [...contacts, ...extra.filter((c) => !seen.has(c.id))];
  }, [contacts, extra]);
  const selected = all.find((c) => c.id === value) ?? null;
  const [open, setOpen] = useState(false); // desktop panel
  const [sheetOpen, setSheetOpen] = useState(false); // phone sheet
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => [...all].sort(byDisplayName), [all]);
  const q = query.trim().toLowerCase();
  const matches = q
    ? sorted.filter((c) => fullName(c).toLowerCase().includes(q))
    : sorted;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Physical keyboard is fine on desktop — focus the filter right away
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function openPicker() {
    setQuery("");
    setHighlight(0);
    if (window.innerWidth < 1024) {
      hapticImpact("LIGHT");
      setSheetOpen(true);
    } else {
      setOpen((v) => !v);
    }
  }

  function pick(c: PickerContact) {
    onChange(c.id);
    setOpen(false);
    setSheetOpen(false);
  }

  function startCreate() {
    setOpen(false);
    setSheetOpen(false);
    setCreateOpen(true);
  }

  function created(c: PickerContact) {
    setExtra((x) => [...x, c]);
    onCreated?.(c);
    onChange(c.id);
  }

  const createLabel = q ? `Add "${query.trim()}" as a new client` : "New client";

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[highlight]) pick(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
      >
        <span className={`truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? fullName(selected) : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-gray-400" />
      </button>

      {/* Desktop anchored dropdown */}
      {open && (
        <div className="ds-glass absolute left-0 right-0 top-full mt-1 z-40 min-w-[16rem] overflow-hidden rounded-xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search size={14} className="shrink-0 text-gray-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search clients…"
              autoComplete="off"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                // mousedown so selection wins over the search input's blur
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-900 ${
                  i === highlight ? "bg-green-50" : ""
                }`}
              >
                <span className="truncate">{fullName(c)}</span>
                {c.id === value && <Check size={14} className="shrink-0 text-green-600" />}
              </button>
            ))}
            {matches.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-gray-400">
                {all.length === 0 ? "No clients yet." : "No matching clients."}
              </p>
            )}
          </div>
          {allowCreate && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                startCreate();
              }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-left text-sm font-medium text-[color:var(--ds-primary,#0B57D8)]"
            >
              <Plus size={14} aria-hidden />
              <span className="truncate">{createLabel}</span>
            </button>
          )}
        </div>
      )}

      {/* Phone sheet — search field only opens the keyboard when tapped */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={title}>
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-[12px] bg-black/5 px-3 py-2">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              autoComplete="off"
              className="w-full bg-transparent text-[16px] outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
        <div className="max-h-[50dvh] overflow-y-auto overscroll-contain px-2">
          {matches.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                pick(c);
              }}
              className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-gray-900 active:bg-black/5"
            >
              <span className="truncate">{fullName(c)}</span>
              {c.id === value && (
                <Check
                  size={16}
                  className="shrink-0"
                  style={{ color: "var(--mobile-accent, #0B57D8)" }}
                />
              )}
            </button>
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">
              {all.length === 0 ? "No clients yet." : "No matching clients."}
            </p>
          )}
        </div>
        {allowCreate && (
          <div className="px-4 pb-3 pt-1">
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                startCreate();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-[12px] px-3 py-3 text-[15px] font-semibold"
              style={{ background: "var(--mobile-accent, #0B57D8)", color: "#fff" }}
            >
              <Plus size={16} aria-hidden />
              <span className="truncate">{createLabel}</span>
            </button>
          </div>
        )}
      </BottomSheet>
      {allowCreate && (
        <QuickContactSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={created}
          initialName={query}
        />
      )}
    </div>
  );
}
