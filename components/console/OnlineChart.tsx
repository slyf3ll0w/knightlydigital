"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ds";
import type { OnlinePoint, OnlineSeries } from "@/lib/presence-history";

/**
 * "People online" on the console home (David 2026-10-02): distinct people
 * with the app in front of them per bucket — 24 h by 15 min, 7 d by hour,
 * 30 d by day (lib/presence-history.ts). One series, drawn as a line over a
 * soft area in the console's primary; a crosshair + tooltip on hover. Test
 * accounts are counted by default (the operator's own test logins are most
 * of the traffic early on) and can be left out with the toggle.
 */

const VIEWS: { key: OnlineSeries["key"]; label: string; peakWord: string }[] = [
  { key: "day", label: "24 h", peakWord: "in 15 min" },
  { key: "week", label: "7 d", peakWord: "in an hour" },
  { key: "month", label: "30 d", peakWord: "in a day" },
];

const W = 640;
const H = 160;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

function fmt(key: OnlineSeries["key"], t: number, long = false): string {
  const d = new Date(t);
  if (key === "month") {
    return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", ...(long ? { weekday: "short" } : {}) });
  }
  if (key === "week") {
    return long
      ? d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric" })
      : d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function OnlineChart({ series }: { series: OnlineSeries[] }) {
  const [view, setView] = useState<OnlineSeries["key"]>("day");
  const [withTest, setWithTest] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const s = series.find((x) => x.key === view)!;
  const meta = VIEWS.find((v) => v.key === view)!;
  const val = (p: OnlinePoint) => (withTest ? p.all : p.live);

  const { max, path, area, xs, peak, hasData } = useMemo(() => {
    const values = s.points.map(val);
    const known = values.filter((v): v is number => v !== null);
    const peak = known.length ? Math.max(...known) : 0;
    const max = Math.max(2, peak % 2 === 0 ? peak : peak + 1);
    const n = s.points.length;
    const xs = s.points.map((_, i) => PAD_L + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_L - PAD_R)));
    const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
    // Separate runs around null gaps (no history yet).
    let path = "";
    let area = "";
    let run: [number, number][] = [];
    const flush = () => {
      if (run.length === 0) return;
      path += run.map(([x, yy], i) => `${i ? "L" : "M"}${x.toFixed(1)},${yy.toFixed(1)}`).join("");
      const base = (H - PAD_B).toFixed(1);
      area += `M${run[0][0].toFixed(1)},${base}` + run.map(([x, yy]) => `L${x.toFixed(1)},${yy.toFixed(1)}`).join("") + `L${run[run.length - 1][0].toFixed(1)},${base}Z`;
      run = [];
    };
    values.forEach((v, i) => (v === null ? flush() : run.push([xs[i], y(v)])));
    flush();
    return { max, path, area, xs, peak, hasData: known.length > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, withTest]);

  const yOf = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const nowVal = val(s.points[s.points.length - 1]) ?? 0;
  const hp = hover !== null ? s.points[hover] : null;
  const hv = hp ? val(hp) : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setHover(best);
  };

  const ticks = [0, max / 2, max];
  const xLabels = [0, Math.floor((s.points.length - 1) / 2), s.points.length - 1];

  return (
    <Card className="ds-rise p-5" style={{ "--ds-i": 8 } as React.CSSProperties}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-6">
          <div>
            <p className="ds-label">Now</p>
            <p className="ds-value mt-1 text-[24px]">{hasData ? nowVal : "—"}</p>
          </div>
          <div>
            <p className="ds-label">Peak {meta.peakWord}</p>
            <p className="ds-value mt-1 text-[24px]">{hasData ? peak : "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="ds-small flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={withTest} onChange={(e) => setWithTest(e.target.checked)} />
            Test accounts
          </label>
          <nav className="flex gap-1" aria-label="Online range">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => {
                  setView(v.key);
                  setHover(null);
                }}
                className={`ds-btn ds-btn-sm ${v.key === view ? "ds-btn-soft" : "ds-btn-ghost"}`}
                aria-pressed={v.key === view}
              >
                {v.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="relative mt-4">
        {!hasData && (
          <p className="ds-small absolute inset-0 flex items-center justify-center text-center">
            History starts the first time someone opens the app after this update.
          </p>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-40 w-full touch-none select-none"
          role="img"
          aria-label={`People online, last ${meta.label}: peak ${peak}, now ${nowVal}`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <line
              key={t}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="var(--ds-line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={t === 0 ? undefined : "2 4"}
            />
          ))}
          {area && <path d={area} fill="var(--ds-primary)" opacity={0.12} />}
          {path && (
            <path d={path} fill="none" stroke="var(--ds-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {hover !== null && hv !== null && (
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD_T} y2={H - PAD_B} stroke="var(--ds-ink-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} />
          )}
        </svg>
        {/* Axis labels and the hover dot are HTML so they don't stretch with the plot. */}
        {ticks.map((t) => (
          <span
            key={t}
            className="ds-small pointer-events-none absolute left-0 -translate-y-1/2 text-[11px] tabular-nums"
            style={{ top: `${(yOf(t) / H) * 100}%` }}
          >
            {Math.round(t)}
          </span>
        ))}
        {hover !== null && hv !== null && (
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(xs[hover] / W) * 100}%`,
              top: `${(yOf(hv) / H) * 100}%`,
              background: "var(--ds-primary)",
              boxShadow: "0 0 0 2px var(--ds-surface, #fff)",
            }}
          />
        )}
        {hp && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-[color:var(--ds-line)] bg-[color:var(--ds-surface,#fff)] px-2.5 py-1.5 text-[12px] shadow-sm"
            style={{
              left: `${(xs[hover!] / W) * 100}%`,
              transform: xs[hover!] > W * 0.7 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <span className="block text-[color:var(--ds-ink-2)]">{fmt(view, hp.t, true)}</span>
            <span className="block font-medium tabular-nums text-[color:var(--ds-ink)]">
              {hv === null ? "No history yet" : `${hv} ${hv === 1 ? "person" : "people"}`}
            </span>
          </div>
        )}
      </div>
      <div className="ds-small mt-1.5 flex justify-between pl-7 text-[11.5px]">
        {xLabels.map((i, k) => (
          <span key={k}>{k === 2 ? "now" : fmt(view, s.points[i].t)}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>People online, last {meta.label}</caption>
        <tbody>
          {s.points.map((p) => (
            <tr key={p.t}>
              <th scope="row">{fmt(view, p.t, true)}</th>
              <td>{val(p) ?? "no history"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
