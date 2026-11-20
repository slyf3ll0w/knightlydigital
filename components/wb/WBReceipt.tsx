"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pricing as the bill itself (home direction preview, David 2026-11-19:
 * "the pricing section looks pretty sad"): a receipt that feeds out of a
 * slot when it scrolls into view, line by line, ending on TOTAL $0.00 with
 * a torn edge. The lines come from the page (which reads lib/plans.ts —
 * never type a price here). Printed and still under reduced motion.
 */

export type ReceiptLine = { label: string; value: string; note?: string; strong?: boolean };

// The torn bottom edge: a zigzag as a clip path.
const TEETH = 22;
const ZIGZAG = `polygon(0 0, 100% 0, ${Array.from({ length: TEETH * 2 + 1 }, (_, k) => `${100 - (k * 100) / (TEETH * 2)}% ${k % 2 ? "100%" : "calc(100% - 10px)"}`).join(", ")})`;

export default function WBReceipt({ title, lines, total, footer }: { title: string; lines: ReceiptLine[]; total: ReceiptLine; footer: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(lines.length + 2);
  const [fed, setFed] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setFed(false);
    setShown(0);
    let timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setFed(true);
        timers = Array.from({ length: lines.length + 2 }, (_, k) => setTimeout(() => setShown(k + 1), 500 + k * 260));
      },
      { threshold: 0.35 },
    );
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [lines.length]);

  const line = (l: ReceiptLine, n: number) => (
    <div
      key={l.label}
      className={`flex items-baseline justify-between gap-4 py-2 transition-[opacity,transform] duration-500 ${shown > n ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"}`}
    >
      <span className={`min-w-0 ${l.strong ? "text-[17px] font-black" : "text-[14.5px] font-semibold text-[#0A1428]"}`}>
        {l.label}
        {l.note && <span className="block text-[12.5px] font-medium text-gray-500">{l.note}</span>}
      </span>
      <span className={`flex-none tabular-nums ${l.strong ? "text-[22px] font-black" : "text-[14.5px] font-bold"}`}>{l.value}</span>
    </div>
  );

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[440px]">
      {/* the printer's slot */}
      <div className="relative z-10 h-4 rounded-full bg-[#0A1428] shadow-[0_6px_14px_-6px_rgba(10,20,40,0.6)]" />
      <div className="-mt-2 overflow-hidden px-3 pb-6">
        <div
          className="bg-white px-7 pb-10 pt-8 text-[#0A1428] shadow-[0_24px_40px_-24px_rgba(10,20,40,0.5)] transition-transform duration-[1400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ clipPath: ZIGZAG, transform: fed ? "translateY(0)" : "translateY(-102%)" }}
        >
          <p className="text-center text-[13px] font-black uppercase tracking-[0.22em]">{title}</p>
          <p className="mt-1 text-center text-[12px] text-gray-500">Your monthly bill</p>
          <div className="mt-5 border-t-2 border-dashed border-gray-300 pt-3">{lines.map((l, n) => line(l, n))}</div>
          <div className="mt-3 border-t-2 border-dashed border-gray-300 pt-3">{line(total, lines.length)}</div>
          <p className={`mt-5 text-center text-[13px] font-semibold text-gray-500 transition-opacity duration-500 ${shown > lines.length + 1 ? "opacity-100" : "opacity-0"}`}>{footer}</p>
          <div className={`mx-auto mt-4 flex h-9 w-48 items-stretch gap-[2px] transition-opacity duration-500 ${shown > lines.length + 1 ? "opacity-100" : "opacity-0"}`} aria-hidden>
            {[3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3].map((w, k) => (
              <span key={k} className="bg-[#0A1428]" style={{ width: w }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
