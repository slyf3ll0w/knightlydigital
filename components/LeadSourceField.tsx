"use client";

import { useEffect, useState } from "react";
import OptionChip, { ChipRow } from "@/components/OptionChip";
import { PICK_LEAD_SOURCES, leadSourceKey } from "@/lib/lead-source";

/**
 * The lead-source pick list (2026-11-17): one list everywhere a person says
 * where a lead came from, so "Google", "google" and "Google Ads " stop
 * becoming three rows on the report. The list is the standard names plus
 * anything this company has already used (GET /api/app/lead-sources);
 * "Something else…" takes a new one, which joins the list once saved.
 * The server still canonicalizes whatever arrives (lib/lead-source.ts).
 */

const OTHER = "__other__";
let cache: Promise<string[]> | null = null;

function loadSources(): Promise<string[]> {
  if (!cache) {
    cache = fetch("/api/app/lead-sources", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { sources?: unknown } | null) => (Array.isArray(j?.sources) ? (j!.sources as unknown[]).filter((s): s is string => typeof s === "string") : [...PICK_LEAD_SOURCES]))
      .catch(() => [...PICK_LEAD_SOURCES]);
    // A failed or stale list is asked for again on the next page, not kept for the tab's life
    setTimeout(() => (cache = null), 60_000);
  }
  return cache;
}

function useSources(): string[] {
  const [sources, setSources] = useState<string[]>([...PICK_LEAD_SOURCES]);
  useEffect(() => {
    let live = true;
    void loadSources().then((s) => {
      if (live && s.length > 0) setSources(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return sources;
}

export default function LeadSourceField({
  value,
  onChange,
  className = "",
  id,
  emptyLabel = "Not set",
  ariaLabel = "Lead source",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  /** What the blank choice says */
  emptyLabel?: string;
  ariaLabel?: string;
}) {
  const sources = useSources();
  const known = sources.some((s) => leadSourceKey(s) === leadSourceKey(value));
  // Typing a new one: stays open while the box is empty, and for a saved value the list doesn't hold yet
  const [typing, setTyping] = useState(false);
  const custom = typing || (value.trim() !== "" && !known);

  return (
    <div>
      <select
        id={id}
        aria-label={ariaLabel}
        value={custom ? OTHER : known ? sources.find((s) => leadSourceKey(s) === leadSourceKey(value)) ?? "" : ""}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true);
            onChange("");
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="">{emptyLabel}</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={OTHER}>Something else…</option>
      </select>
      {custom && (
        <input
          type="text"
          autoFocus={typing}
          value={value}
          maxLength={60}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type where they came from"
          aria-label="Another lead source"
          className={`${className} mt-2`}
        />
      )}
    </div>
  );
}

/** The five most common answers as one-tap chips, then the full list. For quick saves (a caller, a new lead). */
const QUICK = ["Referral", "Google search", "Google Ads", "Facebook", "Repeat client"];

export function LeadSourceChips({ value, onChange, selectClassName = "" }: { value: string; onChange: (v: string) => void; selectClassName?: string }) {
  const quick = QUICK.some((q) => leadSourceKey(q) === leadSourceKey(value));
  const [more, setMore] = useState(false);
  const showList = more || (value.trim() !== "" && !quick);
  return (
    <div>
      <ChipRow ariaLabel="How did they hear about you?">
        {QUICK.map((q) => (
          <OptionChip
            key={q}
            active={leadSourceKey(q) === leadSourceKey(value)}
            onClick={() => {
              setMore(false);
              onChange(leadSourceKey(q) === leadSourceKey(value) ? "" : q);
            }}
          >
            {q}
          </OptionChip>
        ))}
        <OptionChip
          active={showList}
          onClick={() => {
            if (showList) {
              setMore(false);
              onChange("");
            } else setMore(true);
          }}
        >
          Other
        </OptionChip>
      </ChipRow>
      {showList && (
        <div className="mt-2">
          <LeadSourceField value={value} onChange={onChange} className={selectClassName} emptyLabel="Pick one" ariaLabel="How did they hear about you?" />
        </div>
      )}
    </div>
  );
}
