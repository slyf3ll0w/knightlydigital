"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

/**
 * Get started (/apply) facelift, 2026-11-19: a small coded copy of the
 * "Get started" card on the app's Home (lib/get-started.ts: the same
 * steps, same words), the first thing a new account sees. Steps tick off
 * one by one when it scrolls into view and the bar fills; finished and
 * still under reduced motion. Demo company only.
 */

const FONT = { fontFamily: "var(--font-lexend), Lexend, system-ui, sans-serif" };
const NAVY = "#1D2E52";
const ITEMS = ["Online payments are on", "Add your services", "Add your first client", "Send your first quote", "Schedule your first job", "Share your booking page"];
const END = 4;

export default function WBApplyPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(END);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDone(0);
    let timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        timers = Array.from({ length: END }, (_, k) => setTimeout(() => setDone(k + 1), 600 + k * 700));
      },
      { threshold: 0.4 },
    );
    if (ref.current) io.observe(ref.current);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={ref} className="select-none overflow-hidden rounded-xl bg-white text-left text-[#0A1428] shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]" style={FONT} aria-hidden>
      <div className="flex items-center gap-2 px-4 py-2.5 text-white" style={{ background: NAVY }}>
        <span className="flex h-5 w-5 items-center justify-center rounded bg-[#F86A0A] text-[9px] font-bold">B</span>
        <span className="text-[12px] font-semibold">Brightwire Electric · Home</span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-semibold">Get started</p>
          <p className="text-[11.5px] tabular-nums text-gray-500">
            {done} of {ITEMS.length} done
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF0F3]">
          <div className="h-full rounded-full bg-[#F86A0A] transition-[width] duration-500" style={{ width: `${(done / ITEMS.length) * 100}%` }} />
        </div>
        <div className="mt-3 divide-y divide-[#EEF0F3]">
          {ITEMS.map((t, i) => {
            const on = i < done;
            return (
              <div key={t} className="flex items-center gap-3 py-2 text-[12.5px]">
                <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full transition-colors duration-300 ${on ? "bg-[#17703B] text-white" : "ring-1 ring-[#D5DAE3]"}`}>
                  {on && <Check className="wb-pop-in h-3 w-3" strokeWidth={3.2} />}
                </span>
                <span className={`flex-1 ${on ? "text-gray-400 line-through decoration-gray-300" : "font-semibold text-gray-900"}`}>{t}</span>
                {!on && i === done && <ChevronRight className="h-4 w-4 text-[#0B57D8]" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
