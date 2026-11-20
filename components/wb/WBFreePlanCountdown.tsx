"use client";

import { useEffect, useRef, useState } from "react";
import { Infinity as InfinityIcon, Lock, Timer } from "lucide-react";

/**
 * Free plan page, "Most free software is a countdown" (David 2026-11-19:
 * "the free plan page could also look a lot better"). Two solid cards side
 * by side: a typical free trial whose day counter runs out and locks, and
 * the free plan, which has no end date. The rows under each are the page's
 * own comparison (passed in; every number from lib/plans.ts). Under reduced
 * motion the trial shows locked and nothing moves.
 */

export type CountdownRow = { label: string; core: string; trial: string };

const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const START_DAYS = 14;

export default function WBFreePlanCountdown({ rows, planName, monthly }: { rows: CountdownRow[]; planName: string; monthly: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(START_DAYS);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDays(0);
      return;
    }
    let tick: ReturnType<typeof setTimeout> | undefined;
    let n = START_DAYS;
    const step = () => {
      n -= 1;
      setDays(n);
      if (n > 0) tick = setTimeout(step, 170);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        tick = setTimeout(step, 700);
      },
      { threshold: 0.4 },
    );
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      if (tick) clearTimeout(tick);
    };
  }, []);

  const locked = days === 0;
  const shell = "overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]";

  return (
    <div ref={ref} className="grid gap-5 sm:grid-cols-2">
      {/* the trial */}
      <div className={`${shell} relative bg-[#EEF0F3]`}>
        <div className="p-6" style={FONT}>
          <p className="text-[13px] font-semibold text-gray-500">A typical free trial</p>
          <div className="mt-3 flex items-center gap-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${locked ? "bg-gray-400" : "bg-[#64748B]"} text-white`}>
              {locked ? <Lock className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
            </span>
            <span>
              <span className="block text-[24px] font-semibold leading-none tabular-nums text-gray-700">
                {locked ? "Ended" : `${days} day${days === 1 ? "" : "s"}`}
              </span>
              <span className="block text-[12px] text-gray-500">{locked ? "Add a card to keep your data" : "left on your trial"}</span>
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-gray-400 transition-[width] duration-150" style={{ width: `${(days / START_DAYS) * 100}%` }} />
          </div>
        </div>
        <dl className="border-t border-black/5 bg-white/60 px-6 py-2">
          {rows.map((r) => (
            <div key={r.label} className="border-b border-black/5 py-2.5 last:border-0">
              <dt className="text-[12px] font-semibold text-gray-500">{r.label}</dt>
              <dd className="text-[15px] text-gray-600">{r.trial}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* the free plan */}
      <div className={`${shell} bg-white`}>
        <div className="p-6" style={FONT}>
          <p className="text-[13px] font-semibold text-[#0B57D8]">WorkBench {planName}</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0A1428] text-[#FF8B33]">
              <InfinityIcon className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[24px] font-semibold leading-none text-[#0A1428]">No end date</span>
              <span className="block text-[12px] text-gray-500">{monthly} a month, from day one</span>
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#F86A0A]" />
        </div>
        <dl className="border-t border-[#EEF0F3] px-6 py-2">
          {rows.map((r) => (
            <div key={r.label} className="border-b border-[#EEF0F3] py-2.5 last:border-0">
              <dt className="text-[12px] font-semibold text-gray-500">{r.label}</dt>
              <dd className="text-[15px] font-bold text-[#0A1428]">{r.core}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
