"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Know which jobs make you money" (home, David 2026-11-19: the Get paid
 * section repeated what the hero, the job journey and pricing already say).
 * A coded copy of what WorkBench adds up as you work — Insights' collected
 * by month, a job's profit after labor and materials (the job page's
 * Profit margin card), and Insights → Lead sources — whose charts grow in
 * when the section scrolls into view. Brightwire Electric demo numbers.
 * Drawn finished under reduced motion.
 */

const MONTHS: [string, number][] = [
  ["May", 9.2], ["Jun", 11.8], ["Jul", 13.1], ["Aug", 12.4], ["Sep", 15.6], ["Oct", 18.4],
];
const SOURCES: [string, number, string][] = [
  ["Google Ads", 8900, "#0B57D8"],
  ["Referrals", 5120, "#F86A0A"],
  ["Website form", 3480, "#17A34A"],
  ["Online booking", 2210, "#7C9CD6"],
];
// The Olsen sub-panel job: $2,316 billed.
const SPLIT: [string, number, string][] = [
  ["Profit", 1046, "#17A34A"],
  ["Labor", 690, "#0B57D8"],
  ["Materials", 580, "#F86A0A"],
];
const SPLIT_TOTAL = SPLIT.reduce((a, [, v]) => a + v, 0);

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function WBInsights() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setOn(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        requestAnimationFrame(() => setOn(true));
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const max = Math.max(...MONTHS.map(([, v]) => v));
  const srcMax = SOURCES[0][1];
  // donut: circumference of r=42 ≈ 263.9
  const C = 2 * Math.PI * 42;
  let acc = 0;

  return (
    <div ref={ref} className="grid gap-4 text-[#0A1428] sm:grid-cols-2" style={{ fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" }} aria-hidden>
      {/* collected by month */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(10,20,40,0.07),0_18px_34px_-24px_rgba(10,20,40,0.4)] sm:col-span-2">
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-semibold text-gray-500">Collected</p>
          <p className="text-[12px] font-semibold text-[#17703B]">▲ 18% vs last month</p>
        </div>
        <p className="mt-1 text-[26px] font-semibold tabular-nums">$18,420</p>
        <div className="mt-4 flex h-[120px] items-end gap-3">
          {MONTHS.map(([m, v], k) => (
            <div key={m} className="flex h-full flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md transition-[height] duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                  style={{ height: on ? `${(v / max) * 100}%` : "0%", transitionDelay: `${k * 90}ms`, background: k === MONTHS.length - 1 ? "#F86A0A" : "#C9D7F2" }}
                />
              </div>
              <span className={`text-[10.5px] font-semibold ${k === MONTHS.length - 1 ? "text-[#C2410C]" : "text-gray-500"}`}>{m}</span>
            </div>
          ))}
        </div>
      </div>

      {/* one job's profit */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(10,20,40,0.07),0_18px_34px_-24px_rgba(10,20,40,0.4)]">
        <p className="text-[12px] font-semibold text-gray-500">Profit on the Olsen job</p>
        <div className="mt-3 flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] flex-none -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#EEF0F3" strokeWidth="14" />
            {SPLIT.map(([label, v, color], k) => {
              const len = (v / SPLIT_TOTAL) * C;
              const off = acc;
              acc += len;
              return (
                <circle
                  key={label}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={color}
                  strokeWidth="14"
                  strokeDasharray={`${on ? len : 0} ${C}`}
                  strokeDashoffset={-off}
                  className="transition-[stroke-dasharray] duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                  style={{ transitionDelay: `${300 + k * 200}ms` }}
                />
              );
            })}
          </svg>
          <ul className="space-y-1.5 text-[12px]">
            {SPLIT.map(([label, v, color]) => (
              <li key={label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-gray-600">{label}</span>
                <span className="ml-auto pl-2 font-semibold tabular-nums">{usd(v)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-[12px] font-semibold text-[#17703B]">45% margin</p>
      </div>

      {/* lead sources */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(10,20,40,0.07),0_18px_34px_-24px_rgba(10,20,40,0.4)]">
        <p className="text-[12px] font-semibold text-gray-500">Collected by lead source</p>
        <ul className="mt-3 space-y-2.5">
          {SOURCES.map(([label, v, color], k) => (
            <li key={label}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="font-semibold">{label}</span>
                <span className="tabular-nums text-gray-600">{usd(v)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-[#EEF0F3]">
                <div
                  className="h-full rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                  style={{ width: on ? `${(v / srcMax) * 100}%` : "0%", background: color, transitionDelay: `${500 + k * 120}ms` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
