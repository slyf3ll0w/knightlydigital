"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/Input";
import { rateValueText, type EstimatorRate, type EstimatorSpec } from "@/lib/estimator";

/**
 * The tool's rate card: every number it prices with, in the owner's words,
 * so they can hold it against their own price sheet and fix what's off
 * without ever reading a formula. Each row says whose number it is — theirs,
 * a market estimate (with the range, the region and the day it was looked
 * up) or a placeholder — and when it was last set. Typing a number makes it
 * theirs; "Looks right" keeps an estimate as it is and stops the nagging.
 *
 * Crew-time rows sit apart under their own heading with the tool's labor
 * rule spelled out, because "hours per foot" next to "dollars per foot"
 * reads like it is charged twice.
 */

const GROUPS: { kind: EstimatorRate["kind"]; title: string; hint: (spec: EstimatorSpec) => string }[] = [
  { kind: "price", title: "What you charge", hint: (s) => (s.labor === "in_price" ? "Installed prices — labor is already inside them." : s.labor === "billed" ? "Labor is billed on its own line." : "") },
  { kind: "factor", title: "Adjustments", hint: () => "Multipliers and percentages applied to the prices above." },
  {
    kind: "time",
    title: "Crew time",
    hint: (s) => (s.labor === "billed" ? "Person-hours, billed at your labor rate." : "Person-hours. Only sets how long a job is booked for — never added to the price."),
  },
  { kind: "cost", title: "Your costs", hint: () => "Never shown to clients. Used for the margin on each estimate." },
];

const fmtDate = (iso: string | undefined): string => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const money = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function whose(r: EstimatorRate, spec: EstimatorSpec): string {
  const when = fmtDate(r.updatedAt);
  if (r.source === "owner") return when ? `Yours · set ${when}` : "Yours";
  if (r.source === "market") {
    const range = r.low !== undefined && r.high !== undefined ? (r.kind === "price" || r.kind === "cost" ? ` · going range ${money(r.low)}–${money(r.high)}` : ` · usually ${r.low}–${r.high}`) : "";
    const where = spec.market?.where ? ` for ${spec.market.where}` : "";
    const asOf = fmtDate(spec.market?.asOf ?? r.updatedAt);
    return `Market estimate${where}${range}${asOf ? ` · as of ${asOf}` : ""}`;
  }
  return "An estimate, not your number yet — set yours";
}

function RateRow({ rate, spec, busy, onSet }: { rate: EstimatorRate; spec: EstimatorSpec; busy: boolean; onSet?: (id: string, value: number) => void }) {
  const [text, setText] = useState(String(rate.value));
  useEffect(() => setText(String(rate.value)), [rate.value]);
  const parsed = Number(text.replace(/[,$\s]/g, ""));
  const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const changed = valid && parsed !== rate.value;
  const unit = (rate.unit ?? "").trim();
  const dollars = rate.kind === "price" || rate.kind === "cost";
  const commit = () => {
    if (!onSet) return;
    if (!valid) setText(String(rate.value));
    else if (changed) onSet(rate.id, parsed);
  };
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium text-gray-900">{rate.label}</p>
        {rate.note && <p className="text-xs text-gray-500">{rate.note}</p>}
        <p className={`text-xs ${rate.source === "owner" ? "text-gray-400" : "text-gray-600"}`}>{whose(rate, spec)}</p>
      </div>
      {onSet ? (
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            {dollars && <span className="text-sm text-gray-500">$</span>}
            {rate.kind === "factor" && unit !== "%" && <span className="text-sm text-gray-500">×</span>}
            <Input
              value={text}
              inputMode="decimal"
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-24 text-right tabular-nums"
              aria-label={rate.label}
            />
            {unit && unit !== "×" && unit !== "x" && <span className="max-w-[9rem] text-xs text-gray-500">{unit}</span>}
          </div>
          {rate.source !== "owner" && (
            <button type="button" disabled={busy} onClick={() => onSet(rate.id, rate.value)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" title="Keep this number as yours">
              <Check size={12} strokeWidth={3} />
              Looks right
            </button>
          )}
        </div>
      ) : (
        <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{rateValueText(rate)}</p>
      )}
    </li>
  );
}

export default function RateCard({
  spec,
  busy = false,
  onSet,
  onSetMinimum,
  onlyToConfirm = false,
  compact = false,
}: {
  spec: EstimatorSpec;
  busy?: boolean;
  /** Set (or confirm, when the value is unchanged) one rate. Omit for a read-only card. */
  onSet?: (id: string, value: number) => void;
  /** Set the minimum job charge (0 clears it). Omit to leave it off the card. */
  onSetMinimum?: (value: number) => void;
  /** Show only the rates that aren't the owner's yet (the build's finish card). */
  onlyToConfirm?: boolean;
  compact?: boolean;
}) {
  const all = spec.rates ?? [];
  const rates = onlyToConfirm ? all.filter((r) => r.source !== "owner") : all;
  const [minText, setMinText] = useState(spec.minimumTotal ? String(spec.minimumTotal) : "");
  useEffect(() => setMinText(spec.minimumTotal ? String(spec.minimumTotal) : ""), [spec.minimumTotal]);
  if (rates.length === 0 && !onSetMinimum) return null;
  const open = all.filter((r) => r.source !== "owner").length;
  const commitMin = () => {
    if (!onSetMinimum) return;
    const v = minText.trim() === "" ? 0 : Number(minText.replace(/[,$\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) setMinText(spec.minimumTotal ? String(spec.minimumTotal) : "");
    else if (v !== (spec.minimumTotal ?? 0)) onSetMinimum(v);
  };
  return (
    <div className={compact ? "overflow-hidden rounded-xl border border-gray-200" : "card-ledger overflow-hidden"}>
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">{onlyToConfirm ? "Rates to confirm" : "Your rates"}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {open === 0
            ? "Every number this tool prices with. Check them against your price sheet whenever your prices change."
            : `${open === 1 ? "1 number isn't" : `${open} numbers aren't`} yours yet — the tool runs on ${open === 1 ? "an estimate" : "estimates"} there. Type your own, or tap Looks right to keep one.`}
        </p>
      </div>
      {GROUPS.map((g) => {
        const rows = rates.filter((r) => r.kind === g.kind);
        if (rows.length === 0) return null;
        const hint = g.hint(spec);
        return (
          <div key={g.kind} className="border-t border-gray-100">
            <div className="bg-gray-50 px-4 py-2">
              <p className="text-xs font-semibold text-gray-700">{g.title}</p>
              {hint && <p className="text-xs text-gray-500">{hint}</p>}
            </div>
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <RateRow key={r.id} rate={r} spec={spec} busy={busy} onSet={onSet} />
              ))}
            </ul>
          </div>
        );
      })}
      {onSetMinimum && !onlyToConfirm && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 px-4 py-3 sm:flex-nowrap">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm font-medium text-gray-900">Minimum job charge</p>
            <p className="text-xs text-gray-500">The least any job costs — the trip, setup and haul-off. Small jobs are topped up to it.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-sm text-gray-500">$</span>
            <Input
              value={minText}
              inputMode="decimal"
              disabled={busy}
              placeholder="None"
              onChange={(e) => setMinText(e.target.value)}
              onBlur={commitMin}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-24 text-right tabular-nums"
              aria-label="Minimum job charge"
            />
          </div>
        </div>
      )}
    </div>
  );
}
