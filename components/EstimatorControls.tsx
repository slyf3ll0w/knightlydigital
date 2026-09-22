"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { inputCls } from "@/components/Input";
import { textOn } from "@/lib/branding";
import type { EstimatorInput, EstimatorOption } from "@/lib/estimator";

/**
 * The controls an estimate tool renders — shared by the in-app runner
 * (components/EstimatorRunner.tsx) and the website form
 * (components/PublicEstimateForm.tsx) so a tool feels the same in both
 * places. Everything is themed through one object: the app passes its brand
 * accent as a CSS variable, the website form passes the tenant's hex and
 * dark flag. Plain Workbench styling — Inter, soft borders, tinted pills,
 * accent for the interactive state, tabular numerals for money.
 */

export type ControlTheme = {
  dark: boolean;
  /** Hex or a CSS var — used inline for borders, rings and fills. */
  accent: string;
  /** Text color on a solid accent surface. */
  onAccent: string;
  ink: string;
  muted: string;
  faint: string;
  /** Border class for boxes and cards. */
  border: string;
  /** Subtle fill class (group headers, footers). */
  surface: string;
  /** Solid card surface class. */
  card: string;
  input: string;
};

export const APP_THEME: ControlTheme = {
  dark: false,
  accent: "var(--wb-accent, #0B57D8)",
  onAccent: "var(--wb-on-accent, #ffffff)",
  ink: "text-gray-900",
  muted: "text-gray-600",
  faint: "text-gray-500",
  border: "border-gray-200",
  surface: "bg-gray-50",
  card: "bg-white",
  input: inputCls,
};

export function publicTheme(dark: boolean, accent: string): ControlTheme {
  return {
    dark,
    accent,
    onAccent: textOn(accent),
    ink: dark ? "text-white" : "text-gray-900",
    muted: dark ? "text-gray-300" : "text-gray-600",
    faint: dark ? "text-gray-400" : "text-gray-500",
    border: dark ? "border-white/15" : "border-gray-200",
    surface: dark ? "bg-white/5" : "bg-gray-50",
    card: dark ? "bg-white/[0.04]" : "bg-white",
    input: dark
      ? "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
      : "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10",
  };
}

/** A translucent wash of the accent (works with hex and CSS vars alike). */
export const wash = (t: ControlTheme, pct: number) => `color-mix(in srgb, ${t.accent} ${pct}%, transparent)`;

/** Selected-state inline style: accent border + soft ring + faint wash. */
export function selectedStyle(t: ControlTheme, on: boolean): React.CSSProperties | undefined {
  return on ? { borderColor: t.accent, boxShadow: `0 0 0 2px ${wash(t, 35)}`, backgroundColor: wash(t, t.dark ? 14 : 6) } : undefined;
}

export const moneyExact = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyRound = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// ── count-up numeral ─────────────────────────────────────────────────────────

/** Eases a number toward its target on every change (~380 ms). Null passes straight through. */
export function useCountUp(target: number | null, ms = 380): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const from = useRef<number | null>(target);
  useEffect(() => {
    if (target === null || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    // first number rises from zero; later ones glide from where they were
    const start = from.current ?? 0;
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (target - start) * eased);
      if (p < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

/** The big number: "Your estimate" + $1,234 (counted up) + a sub line. `text` overrides the amount (ranges). */
export function PriceHero({ theme, label, amount, text, sub, size = "xl", exact = true }: { theme: ControlTheme; label: string; amount?: number | null; text?: string; sub?: string; size?: "lg" | "xl"; exact?: boolean }) {
  const shown = useCountUp(amount ?? null);
  const value = text ?? (shown === null ? "—" : exact ? moneyExact(shown) : moneyRound(shown));
  return (
    <div className="rounded-2xl px-5 py-5 text-center" style={{ backgroundColor: wash(theme, theme.dark ? 16 : 8) }}>
      <p className={`text-xs font-semibold ${theme.faint}`}>{label}</p>
      <p className={`mt-1 font-bold tabular-nums tracking-tight ${theme.ink} ${size === "xl" ? "text-4xl sm:text-5xl" : "text-3xl"}`}>{value}</p>
      {sub && <p className={`mt-1.5 text-sm ${theme.muted}`}>{sub}</p>}
    </div>
  );
}

// ── number: presets / slider / stepper / field ───────────────────────────────

type NumberInput = Extract<EstimatorInput, { type: "number" }>;

const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function NumberControl({ inp, value, onChange, theme, required }: { inp: NumberInput; value: string; onChange: (v: string) => void; theme: ControlTheme; required: boolean }) {
  const num = value === "" ? null : Number(value);
  const step = inp.step ?? (inp.control === "slider" && inp.max !== undefined ? Math.max(1, Math.round((inp.max - (inp.min ?? 0)) / 100)) : 1);
  const min = inp.min ?? 0;
  const chip = (on: boolean) => `inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors ${on ? "" : `${theme.border} ${theme.muted}`}`;
  const bump = (d: number) => {
    const cur = num ?? (inp.default ?? min);
    const next = Math.max(inp.min ?? 0, Math.min(inp.max ?? Number.POSITIVE_INFINITY, cur + d * step));
    onChange(String(next));
  };
  return (
    <div className="space-y-2">
      {inp.presets && inp.presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {inp.presets.map((p) => {
            const on = num !== null && num === p.value;
            return (
              <button key={p.label} type="button" aria-pressed={on} onClick={() => onChange(on ? "" : String(p.value))} className={chip(on)} style={on ? { backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent } : undefined}>
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {inp.control === "slider" && inp.max !== undefined ? (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={inp.max}
            step={step}
            value={num ?? inp.default ?? min}
            onChange={(e) => onChange(e.target.value)}
            aria-label={inp.label}
            className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
            style={{ accentColor: theme.accent, background: `linear-gradient(to right, ${theme.accent} ${(((num ?? inp.default ?? min) - min) / (inp.max - min)) * 100}%, ${wash(theme, theme.dark ? 25 : 14)} 0)` }}
          />
          <div className="flex w-32 shrink-0 items-center gap-1.5">
            <input type="number" inputMode="decimal" value={value} min={inp.min} max={inp.max} step="any" required={required} onChange={(e) => onChange(e.target.value)} className={`${theme.input} !px-2 !py-2 text-right tabular-nums`} aria-label={`${inp.label} (number)`} />
            {inp.unit && <span className={`shrink-0 text-xs ${theme.faint}`}>{inp.unit}</span>}
          </div>
        </div>
      ) : inp.control === "stepper" ? (
        <div className={`inline-flex h-12 items-stretch overflow-hidden rounded-xl border ${theme.border}`}>
          <button type="button" onClick={() => bump(-1)} disabled={num !== null && inp.min !== undefined && num <= inp.min} className={`flex w-12 items-center justify-center ${theme.muted} hover:bg-black/5 disabled:opacity-30`} aria-label={`Fewer ${inp.unit ?? ""}`}>
            <Minus size={16} />
          </button>
          <div className={`flex min-w-[6.5rem] items-center justify-center gap-1 border-x px-3 ${theme.border}`}>
            <input type="number" inputMode="numeric" value={value} min={inp.min} max={inp.max} step="any" required={required} onChange={(e) => onChange(e.target.value)} className={`w-14 bg-transparent text-center text-base font-semibold tabular-nums ${theme.ink} focus:outline-none`} aria-label={inp.label} placeholder="0" />
            {inp.unit && <span className={`text-xs ${theme.faint}`}>{inp.unit}</span>}
          </div>
          <button type="button" onClick={() => bump(1)} disabled={num !== null && inp.max !== undefined && num >= inp.max} className={`flex w-12 items-center justify-center ${theme.muted} hover:bg-black/5 disabled:opacity-30`} aria-label={`More ${inp.unit ?? ""}`}>
            <Plus size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input type="number" inputMode="decimal" value={value} min={inp.min} max={inp.max} step={inp.step ?? "any"} required={required} onChange={(e) => onChange(e.target.value)} className={`${theme.input} max-w-[14rem] tabular-nums`} aria-label={inp.label} />
          {inp.unit && <span className={`shrink-0 text-sm ${theme.faint}`}>{inp.unit}</span>}
        </div>
      )}
      {inp.control === "slider" && inp.max !== undefined && (
        <div className={`flex justify-between text-[11px] ${theme.faint}`}>
          <span>
            {fmtNum(min)} {inp.unit}
          </span>
          <span>
            {fmtNum(inp.max)} {inp.unit}
          </span>
        </div>
      )}
    </div>
  );
}

// ── select: list / cards / packages ──────────────────────────────────────────

type SelectInput = Extract<EstimatorInput, { type: "select" }>;

/** `tierPrices` = live price label per option value (package tiers); undefined = still pricing, null = can't price yet. */
export function ChoiceControl({ inp, value, onChange, theme, required, tierPrices }: { inp: SelectInput; value: string; onChange: (v: string) => void; theme: ControlTheme; required: boolean; tierPrices?: Record<string, string | null> }) {
  const style = inp.style ?? (inp.options.some((o) => o.image) ? "cards" : "list");
  if (style === "list") {
    return (
      <select value={value} required={required} onChange={(e) => onChange(e.target.value)} className={`${theme.input} ${theme.dark ? "[&>option]:text-gray-900" : ""}`} aria-label={inp.label}>
        <option value="">Choose…</option>
        {inp.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (style === "packages") {
    const cols = inp.options.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
    return (
      <div className={`grid grid-cols-1 gap-2.5 ${cols}`} role="radiogroup" aria-label={inp.label}>
        {inp.options.map((o) => {
          const on = value === o.value;
          const price = tierPrices ? tierPrices[o.value] : undefined;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`relative flex flex-col rounded-2xl border p-4 text-left transition-shadow ${theme.border} ${theme.card} ${on ? "" : "hover:shadow-sm"}`}
              style={selectedStyle(theme, on)}
            >
              {o.recommended && (
                <span className="absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: theme.accent, color: theme.onAccent }}>
                  Most popular
                </span>
              )}
              <span className="flex items-start justify-between gap-2">
                <span className={`text-sm font-semibold ${theme.ink}`}>{o.label}</span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "" : theme.border}`} style={on ? { backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent } : undefined} aria-hidden>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              </span>
              <span className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${theme.ink}`}>{price === undefined ? <span className={`text-sm font-medium ${theme.faint}`}>{tierPrices ? "Pricing…" : ""}</span> : price === null ? <span className={`text-sm font-medium ${theme.faint}`}>Answer above to price</span> : price}</span>
              {o.blurb && <span className={`mt-1 text-xs ${theme.muted}`}>{o.blurb}</span>}
              {o.includes && o.includes.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {o.includes.map((line) => (
                    <li key={line} className={`flex items-start gap-1.5 text-xs ${theme.muted}`}>
                      <Check size={13} strokeWidth={2.5} className="mt-0.5 shrink-0" style={{ color: theme.accent }} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>
    );
  }
  // cards
  const hasImages = inp.options.some((o) => o.image);
  return (
    <div className={`grid gap-2 ${hasImages ? "grid-cols-2 sm:grid-cols-3" : inp.options.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`} role="radiogroup" aria-label={inp.label}>
      {inp.options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(on && !required ? "" : o.value)} className={`overflow-hidden rounded-xl border text-left transition-shadow ${theme.border} ${theme.card} ${on ? "" : "hover:shadow-sm"}`} style={selectedStyle(theme, on)}>
            {o.image && <img src={o.image} alt="" className="aspect-[4/3] w-full object-cover" />}
            <span className="block px-3 py-2.5">
              <span className={`flex items-center justify-between gap-2 text-sm font-medium ${theme.ink}`}>
                {o.label}
                {on && <Check size={14} strokeWidth={3} style={{ color: theme.accent }} />}
              </span>
              {o.blurb && <span className={`mt-0.5 block text-xs ${theme.muted}`}>{o.blurb}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── multi: chips or picture cards ────────────────────────────────────────────

type MultiInput = Extract<EstimatorInput, { type: "multi" }>;

export function MultiControl({ inp, value, onToggle, theme }: { inp: MultiInput; value: string[]; onToggle: (v: string) => void; theme: ControlTheme }) {
  const hasImages = inp.options.some((o) => o.image || o.blurb);
  if (hasImages) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={inp.label}>
        {inp.options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button key={o.value} type="button" aria-pressed={on} onClick={() => onToggle(o.value)} className={`overflow-hidden rounded-xl border text-left ${theme.border} ${theme.card}`} style={selectedStyle(theme, on)}>
              {o.image && <img src={o.image} alt="" className="aspect-[4/3] w-full object-cover" />}
              <span className="block px-3 py-2.5">
                <span className={`flex items-center justify-between gap-2 text-sm font-medium ${theme.ink}`}>
                  {o.label}
                  {on && <Check size={14} strokeWidth={3} style={{ color: theme.accent }} />}
                </span>
                {o.blurb && <span className={`mt-0.5 block text-xs ${theme.muted}`}>{o.blurb}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={inp.label}>
      {inp.options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onToggle(o.value)} className={`inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-medium ${on ? "" : `${theme.border} ${theme.muted}`}`} style={on ? { backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent } : undefined}>
            {on && <Check size={12} strokeWidth={3} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── toggle row ───────────────────────────────────────────────────────────────

export function ToggleRow({ label, help, value, onChange, theme }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void; theme: ControlTheme }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left ${theme.border} ${theme.card}`} style={selectedStyle(theme, value)}>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${theme.ink}`}>{label}</span>
        {help && <span className={`block text-xs ${theme.muted}`}>{help}</span>}
      </span>
      <span className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ backgroundColor: value ? theme.accent : theme.dark ? "rgba(255,255,255,0.2)" : "#d1d5db" }} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

// ── step rail (one step per section) ─────────────────────────────────────────

export function StepRail({ titles, idx, theme }: { titles: (string | null)[]; idx: number; theme: ControlTheme }) {
  if (titles.length < 2) return null;
  return (
    <ol className="flex items-center gap-2" aria-label="Steps">
      {titles.map((t, i) => {
        const done = i < idx;
        const on = i === idx;
        return (
          <li key={i} className={`flex min-w-0 items-center gap-2 ${i < titles.length - 1 ? "flex-1" : ""}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${on || done ? "" : `${theme.border} ${theme.faint}`}`} style={on || done ? { backgroundColor: done ? theme.accent : "transparent", borderColor: theme.accent, color: done ? theme.onAccent : theme.accent } : undefined}>
              {done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`truncate text-xs font-medium ${on ? theme.ink : theme.faint} ${on ? "" : "hidden sm:inline"}`}>{t ?? `Step ${i + 1}`}</span>
            {i < titles.length - 1 && <span className="h-px min-w-3 flex-1" style={{ backgroundColor: done ? theme.accent : wash(theme, theme.dark ? 25 : 18) }} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

// ── breakdown ────────────────────────────────────────────────────────────────

export type BreakdownLine = { name: string; description?: string; quantity: number; unitPrice: number; isOptional: boolean; group?: string };

/** Lines grouped under their headings, each group subtotaled, optional lines tagged. Reads like the quote will. */
export function Breakdown({ lines, subtotal, theme, exact = true }: { lines: BreakdownLine[]; subtotal: number; theme: ControlTheme; exact?: boolean }) {
  const money = exact ? moneyExact : moneyRound;
  const groups: { title: string | null; lines: BreakdownLine[] }[] = [];
  for (const l of lines) {
    const title = l.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.lines.push(l);
    else groups.push({ title, lines: [l] });
  }
  const grouped = groups.some((g) => g.title);
  const hasOptional = lines.some((l) => l.isOptional);
  return (
    <div className={`overflow-hidden rounded-xl border ${theme.border}`}>
      {groups.map((g, gi) => (
        <div key={`${g.title ?? ""}-${gi}`}>
          {grouped && (
            <div className={`flex items-center justify-between px-4 py-1.5 ${theme.surface}`}>
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${theme.faint}`}>{g.title ?? "Other"}</span>
              <span className={`text-[11px] font-medium tabular-nums ${theme.faint}`}>{money(g.lines.filter((l) => !l.isOptional).reduce((s, l) => s + l.quantity * l.unitPrice, 0))}</span>
            </div>
          )}
          {g.lines.map((l, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${i > 0 || grouped ? `border-t ${theme.border}` : ""}`}>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${theme.ink}`}>
                  {l.name}
                  {l.isOptional && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${theme.surface} ${theme.faint}`}>optional</span>}
                </p>
                {l.description && <p className={`text-xs ${theme.muted}`}>{l.description}</p>}
                {l.quantity !== 1 && (
                  <p className={`text-xs tabular-nums ${theme.faint}`}>
                    {l.quantity} × {moneyExact(l.unitPrice)}
                  </p>
                )}
              </div>
              <p className={`shrink-0 text-sm font-semibold tabular-nums ${theme.ink}`}>{money(l.quantity * l.unitPrice)}</p>
            </div>
          ))}
        </div>
      ))}
      <div className={`flex items-center justify-between border-t px-4 py-3 ${theme.border} ${theme.surface}`}>
        <span className={`text-sm font-medium ${theme.muted}`}>Total{hasOptional ? " (before optional items)" : ""}</span>
        <span className={`text-base font-bold tabular-nums ${theme.ink}`}>{money(subtotal)}</span>
      </div>
    </div>
  );
}

/** The bullets of the picked package tier, if the tool has one. */
export function pickedIncludes(inputs: EstimatorInput[], values: Record<string, unknown>): { tier: string; includes: string[] } | null {
  for (const inp of inputs) {
    if (inp.type !== "select" || inp.style !== "packages") continue;
    const opt = inp.options.find((o) => o.value === values[inp.id]);
    if (opt?.includes?.length) return { tier: opt.label, includes: opt.includes };
  }
  return null;
}

export type { EstimatorOption };
