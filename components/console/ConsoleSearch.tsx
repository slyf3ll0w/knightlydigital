"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Chip } from "@/components/ds";

/**
 * Jump to any account from anywhere in the console: name, slug or a team
 * member's email. "/" focuses it from any page (like the app's ⌘K palette),
 * arrows move, Enter opens, Esc closes. Results float on glass (rule 12).
 */

type Hit = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  isTest: boolean;
  suspended: boolean;
  pending: boolean;
};

export default function ConsoleSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  // Live lookup, a beat behind typing; stale answers are dropped.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setHits([]);
      setBusy(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/superadmin/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((data: { hits: Hit[] }) => {
          if (mine !== seq.current) return;
          setHits(data.hits ?? []);
          setIndex(0);
          setBusy(false);
        })
        .catch(() => {
          if (mine === seq.current) setBusy(false);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  // "/" from anywhere focuses the box (not while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    router.push(`/superadmin/company/${hit.id}`);
  }

  const showList = open && q.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-faint)]" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && hits[index]) {
              e.preventDefault();
              go(hits[index]);
            }
          }}
          placeholder="Find an account…  /"
          aria-label="Find an account"
          autoComplete="off"
          className="h-9 w-full rounded-full border border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface)] pl-9 pr-9 text-[13.5px] text-[color:var(--ds-ink)] placeholder:text-[color:var(--ds-faint)] focus:border-[color:var(--ds-primary)] focus:outline-none"
        />
        {busy && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[color:var(--ds-faint)]" aria-hidden />}
      </div>

      {showList && (
        <div className="ds-card ds-glass absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden p-1.5" role="listbox">
          {hits.length === 0 && !busy && <p className="ds-small px-3 py-2.5">No account matches “{q.trim()}”.</p>}
          {hits.map((h, i) => (
            <button
              key={h.id}
              type="button"
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(h)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                i === index ? "bg-[color:var(--ds-primary-soft)]" : "hover:bg-[color:var(--ds-surface-2)]"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-[color:var(--ds-ink)]">{h.name}</span>
                <span className="ds-small block truncate">
                  /{h.slug}
                  {h.industry ? ` · ${h.industry}` : ""}
                </span>
              </span>
              {h.suspended ? (
                <Chip tone="bad">Suspended</Chip>
              ) : h.pending ? (
                <Chip tone="warn">Pending</Chip>
              ) : h.isTest ? (
                <Chip tone="neutral">Test</Chip>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
