"use client";

import { Users } from "lucide-react";
import { InfoTip } from "@/components/ds";
import { inputCls } from "@/components/Input";
import {
  EXPIRY_CHOICES,
  STICKY_BODY_MAX,
  STICKY_COLORS,
  STICKY_SIZES,
  type ExpiryChoice,
  type StickyColor,
} from "@/lib/sticky-shared";

export type StickyDraft = {
  body: string;
  color: StickyColor;
  size: "S" | "M" | "L";
  shared: boolean;
  expiry: ExpiryChoice;
  expiryDate: string;
};

export const emptyDraft = (prefill?: string): StickyDraft => ({
  body: prefill ? `${prefill.trim()}\n` : "",
  color: "YELLOW",
  size: "M",
  shared: false,
  expiry: "none",
  expiryDate: "",
});

export function sizeKeyFor(px: number): "S" | "M" | "L" {
  let best: "S" | "M" | "L" = "M";
  let d = Infinity;
  for (const s of STICKY_SIZES) {
    const dd = Math.abs(s.px - px);
    if (dd < d) {
      d = dd;
      best = s.key;
    }
  }
  return best;
}

/**
 * The sticky's fields, shared by the editor sheet (desktop / phone) and
 * the phone page strip's inline composer: the note itself is the text
 * box, five papers, three sizes, an expiry, and Pin to the team board.
 */
export default function StickyForm({
  draft,
  onChange,
  canPin,
  readOnly = false,
  autoFocus = true,
  compact = false,
}: {
  draft: StickyDraft;
  onChange: (next: StickyDraft) => void;
  canPin: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** The phone strip: tighter rows */
  compact?: boolean;
}) {
  const set = <K extends keyof StickyDraft>(k: K, v: StickyDraft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      <div className={`ds-sticky-${draft.color.toLowerCase()}`}>
        <textarea
          value={draft.body}
          onChange={(e) => set("body", e.target.value.slice(0, STICKY_BODY_MAX))}
          readOnly={readOnly}
          maxLength={STICKY_BODY_MAX}
          placeholder="Call the supplier Monday…"
          aria-label="Note"
          autoFocus={autoFocus && !readOnly}
          rows={compact ? 3 : 5}
          className={`ds-sticky-input ${compact ? "ds-sticky-input-compact" : ""}`}
        />
      </div>

      {!readOnly && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Paper color">
              {STICKY_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c.key}
                  aria-pressed={draft.color === c.key}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => set("color", c.key)}
                  className={`ds-sticky-dot ds-sticky-${c.key.toLowerCase()}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Size">
              {STICKY_SIZES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.size === s.key}
                  aria-label={s.label}
                  title={s.label}
                  onClick={() => set("size", s.key)}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                    draft.size === s.key
                      ? "bg-[color:var(--ds-primary)] text-white"
                      : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-ink-2)]"
                  }`}
                >
                  {s.key}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <select
              value={draft.expiry}
              onChange={(e) => set("expiry", e.target.value as ExpiryChoice)}
              aria-label="Comes down"
              className={`${inputCls} py-2 text-[13px]`}
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {draft.expiry === "custom" ? (
              <input
                type="date"
                value={draft.expiryDate}
                onChange={(e) => set("expiryDate", e.target.value)}
                aria-label="Day it comes down"
                className={`${inputCls} w-auto py-2 text-[13px]`}
              />
            ) : (
              <span className="ds-small">{draft.body.length}/{STICKY_BODY_MAX}</span>
            )}
          </div>

          {canPin && (
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--ds-ink)]">
              <input
                type="checkbox"
                checked={draft.shared}
                onChange={(e) => set("shared", e.target.checked)}
                className="h-4 w-4 rounded accent-[color:var(--ds-primary)]"
              />
              <Users size={14} className="text-[color:var(--ds-muted)]" aria-hidden />
              Show it to the whole team
              <InfoTip>Everyone in the company sees it on this page. Each person can slide it around on their own screen.</InfoTip>
            </label>
          )}
        </>
      )}
    </div>
  );
}
