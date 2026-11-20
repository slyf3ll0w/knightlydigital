"use client";

import { useEffect, useRef, useState } from "react";

export type CompareRow = {
  label: string;
  workbench: React.ReactNode;
  competitor: React.ReactNode;
};

/**
 * Side-by-side comparison used on the /vs/[competitor] pages: one solid
 * card, a row per topic that slides in one after another when the table
 * scrolls into view. On a phone each row stacks (topic, WorkBench, them)
 * instead of scrolling sideways. Keep rows factual and hedge anything
 * price-related — competitor pricing pages change without notice, and this
 * table doesn't re-check them at build time. Rows come from lib/wb-vs.ts.
 */
export default function WBCompareTable({ competitorName, rows }: { competitorName: string; rows: CompareRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShown(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setShown(true);
      },
      { threshold: 0.15 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role="table"
      aria-label={`WorkBench and ${competitorName}, side by side`}
      className="overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]"
    >
      <div role="row" className="hidden grid-cols-[200px_1fr_1fr] bg-[#0A1428] md:grid">
        <span role="columnheader" className="px-6 py-4" />
        <span role="columnheader" className="px-6 py-4 text-[16px] font-black text-white">
          WorkBench
        </span>
        <span role="columnheader" className="px-6 py-4 text-[16px] font-black text-white/70">
          {competitorName}
        </span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          role="row"
          className={`grid gap-3 border-t border-gray-200 px-5 py-5 first:border-t-0 md:grid-cols-[200px_1fr_1fr] md:gap-0 md:px-0 md:py-0 md:first:border-t-0 ${shown ? "wb-row-in" : "opacity-0"}`}
          style={shown ? { animationDelay: `${i * 110}ms` } : undefined}
        >
          <span role="rowheader" className="text-[16px] font-black text-[#0A1428] md:px-6 md:py-5">
            {r.label}
          </span>
          <span role="cell" className="text-[15px] leading-relaxed text-gray-700 md:border-l md:border-gray-100 md:bg-[#F7FAFF] md:px-6 md:py-5">
            <span className="mb-1 block text-[12.5px] font-black text-[#0B57D8] md:hidden">WorkBench</span>
            {r.workbench}
          </span>
          <span role="cell" className="text-[15px] leading-relaxed text-gray-500 md:border-l md:border-gray-100 md:px-6 md:py-5">
            <span className="mb-1 block text-[12.5px] font-black text-gray-500 md:hidden">{competitorName}</span>
            {r.competitor}
          </span>
        </div>
      ))}
    </div>
  );
}
