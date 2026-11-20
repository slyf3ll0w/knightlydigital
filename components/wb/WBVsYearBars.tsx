"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A year of cost, as bars that grow in when they scroll into view: one group
 * for the software bill, one for the card fees. The software bars show the
 * difference (WorkBench's sits near zero); the card-fee bars show the part
 * that is about the same anywhere. Every number arrives computed from
 * lib/wb-savings.ts (WBVsCost) — never typed here. Drawn at full length
 * without JS or under reduced motion.
 */

export type YearBarRow = {
  name: string;
  ours: boolean;
  /** "Connect", "Core + 1 extra" … */
  plan: string;
  software: string;
  softwareCents: number;
  card: string;
  cardCents: number;
};

function Group({ title, rows, pick, label, go, offset }: { title: string; rows: YearBarRow[]; pick: (r: YearBarRow) => number; label: (r: YearBarRow) => string; go: boolean; offset: number }) {
  const max = Math.max(1, ...rows.map(pick));
  return (
    <div>
      <p className="text-[15px] font-black text-[#0A1428]">{title}</p>
      <ul className="mt-4 space-y-4">
        {rows.map((r, i) => {
          const pct = Math.max(1.5, (pick(r) / max) * 100);
          return (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[15px] font-extrabold text-[#0A1428]">
                  {r.name}
                  <span className="ml-2 text-[13px] font-semibold text-gray-500">{r.plan}</span>
                </span>
                <span className={`flex-none text-[16px] font-black tabular-nums ${r.ours ? "text-[#0B57D8]" : "text-[#0A1428]"}`}>{label(r)}</span>
              </div>
              <div className="mt-2 h-3.5 overflow-hidden rounded-[4px] bg-[#EDF0F5]">
                <div
                  className={`h-full rounded-[4px] ${r.ours ? "bg-[#0B57D8]" : "bg-[#F86A0A]"}`}
                  style={{
                    width: go ? `${pct}%` : "0%",
                    transition: "width 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
                    transitionDelay: `${offset + i * 160}ms`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function WBVsYearBars({ rows, footer }: { rows: YearBarRow[]; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setGo(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        requestAnimationFrame(() => setGo(true));
      },
      { threshold: 0.3 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid gap-8">
      <Group title="Software, a year" rows={rows} pick={(r) => r.softwareCents} label={(r) => r.software} go={go} offset={150} />
      <div className="border-t border-gray-200 pt-7">
        <Group title="Card fees, a year" rows={rows} pick={(r) => r.cardCents} label={(r) => r.card} go={go} offset={650} />
      </div>
      {footer}
    </div>
  );
}
