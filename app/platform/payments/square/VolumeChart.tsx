"use client";

import { useId, useMemo, useRef, useState } from "react";

export type VolumePoint = {
  /** "Nov 3" — the day this point is. */
  label: string;
  /** Gross volume that day, dollars. */
  cur: number;
  /** The same day of the previous period, dollars (null past its end). */
  prev: number | null;
  /** "Oct 4" — the previous period's matching day. */
  prevLabel: string | null;
};

const W = 640;
const H = 180;
const PAD_T = 12;
const PAD_B = 22;

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 1000 ? 0 : 2 });
const axisFmt = (n: number) => (n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`);

/**
 * Gross volume by day, Stripe-style: this period as a brand line over a soft
 * fill, the previous period as a dashed neutral line, a crosshair + tooltip
 * on hover / touch. One y-axis; the top gridline is labeled, the rest recede.
 */
export default function VolumeChart({ points }: { points: VolumePoint[] }) {
  const gid = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { max, x, y, curPath, areaPath, prevPath } = useMemo(() => {
    const vals = points.flatMap((p) => [p.cur, p.prev ?? 0]);
    const top = Math.max(...vals, 0);
    // A round ceiling so the one labeled gridline reads as a clean number.
    const mag = top > 0 ? Math.pow(10, Math.floor(Math.log10(top))) : 1;
    const max = top > 0 ? Math.ceil(top / mag) * mag : 100;
    const n = Math.max(points.length - 1, 1);
    const x = (i: number) => (i / n) * W;
    const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
    const line = (vals: (number | null)[]) =>
      vals
        .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
        .filter(Boolean)
        .map((pt, i) => `${i === 0 ? "M" : "L"}${pt}`)
        .join(" ");
    const curPath = line(points.map((p) => p.cur));
    const areaPath = points.length ? `${curPath} L${x(points.length - 1).toFixed(1)},${y(0)} L0,${y(0)} Z` : "";
    const prevPath = line(points.map((p) => p.prev));
    return { max, x, y, curPath, areaPath, prevPath };
  }, [points]);

  function onMove(clientX: number) {
    const svg = ref.current;
    if (!svg || points.length === 0) return;
    const r = svg.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(Math.round(frac * (points.length - 1)));
  }

  const h = hover != null ? points[hover] : null;
  const hx = hover != null ? (x(hover) / W) * 100 : 0;
  const ticks = points.length > 1 ? [0, points.length - 1] : [0];

  return (
    <div className="relative select-none">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-44 w-full overflow-visible touch-pan-y lg:h-64"
        role="img"
        aria-label="Gross volume by day, this period and the previous one"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`vg-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--ds-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--ds-line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={f === 0 ? undefined : "2 4"}
          />
        ))}
        {prevPath && (
          <path d={prevPath} fill="none" stroke="var(--ds-muted)" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
        <path d={areaPath} fill={`url(#vg-${gid})`} />
        <path d={curPath} fill="none" stroke="var(--ds-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={y(0)} stroke="var(--ds-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Dots and labels live in HTML so they stay round and crisp under the stretched viewBox. */}
      {h && (
        <span
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--ds-surface)] bg-[color:var(--ds-primary)]"
          style={{ left: `${hx}%`, top: `${(y(h.cur) / H) * 100}%` }}
        />
      )}
      <span className="pointer-events-none absolute right-0 top-0 -translate-y-1/2 text-[11px] text-[color:var(--ds-muted)] numeral-ledger">{axisFmt(max)}</span>
      <div className="mt-1 flex justify-between text-[11px] text-[color:var(--ds-muted)]">
        {ticks.map((i) => (
          <span key={i}>{points[i]?.label}</span>
        ))}
      </div>
      {h && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[9.5rem] rounded-lg border border-gray-200 bg-[color:var(--ds-surface)] px-3 py-2 text-xs shadow-lg"
          style={{ left: `${hx}%`, transform: `translateX(${hx > 60 ? "calc(-100% - 10px)" : "10px"})` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[color:var(--ds-muted)]">
              <span className="h-0.5 w-3 rounded bg-[color:var(--ds-primary)]" />
              {h.label}
            </span>
            <span className="numeral-ledger font-semibold text-[color:var(--ds-ink)]">{fmt(h.cur)}</span>
          </div>
          {h.prev != null && (
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[color:var(--ds-muted)]">
                <span className="h-0 w-3 border-t border-dashed border-[color:var(--ds-muted)]" />
                {h.prevLabel}
              </span>
              <span className="numeral-ledger text-[color:var(--ds-muted)]">{fmt(h.prev)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
