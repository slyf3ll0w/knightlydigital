"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Free forever, not a trial" drawn as the bill over time: a track that
 * runs from day one out to year five with $0 stamped at every stop, and the
 * point where a free trial would run out marked and passed. The plan name
 * and seat count arrive from the page (lib/plans.ts). Shown finished
 * without JS or under reduced motion.
 */

const STOPS = [
  { when: "Day 1", note: "Sign up, no card" },
  { when: "Day 14", note: "A trial would end here", trial: true },
  { when: "Month 6", note: "Still the full product" },
  { when: "Year 1", note: "No renewal to sign" },
  { when: "Year 5", note: "Still $0" },
];

export default function WBPriceForever({ planName, seats }: { planName: string; seats: number }) {
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
      { threshold: 0.35 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="rounded-xl bg-white p-6 shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)] sm:p-9"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[18px] font-black text-[#0A1428]">
          Your {planName} bill, {seats} users
        </p>
        <p className="text-[14px] font-semibold text-gray-500">Software only</p>
      </div>

      {/* The track: across on wide screens, down on a phone */}
      <ol className="relative mt-9 grid gap-7 pl-8 sm:grid-cols-5 sm:gap-3 sm:pl-0 sm:pt-12">
        {/* rail */}
        <span className="absolute bottom-2 left-[11px] top-2 w-1 rounded-full bg-[#EDF0F5] sm:bottom-auto sm:left-2 sm:right-2 sm:top-[11px] sm:h-1 sm:w-auto" aria-hidden />
        <span
          className="absolute left-[11px] top-2 w-1 rounded-full bg-[#0B57D8] sm:hidden"
          style={{ height: go ? "calc(100% - 16px)" : "0%", transition: "height 2.2s cubic-bezier(0.2,0.8,0.2,1)" }}
          aria-hidden
        />
        <span
          className="absolute left-2 top-[11px] hidden h-1 rounded-full bg-[#0B57D8] sm:block"
          style={{ width: go ? "calc(100% - 16px)" : "0%", transition: "width 2.2s cubic-bezier(0.2,0.8,0.2,1)" }}
          aria-hidden
        />
        {STOPS.map((s, i) => (
          <li key={s.when} className="relative sm:text-center">
            <span className="absolute -left-8 top-0.5 h-[26px] w-[26px] sm:-top-12 sm:left-1/2 sm:-translate-x-1/2" aria-hidden>
              <span
                className={`block h-full w-full rounded-full border-4 border-white ${s.trial ? "bg-[#F86A0A]" : "bg-[#0B57D8]"} ${go ? "wb-pop-in" : "opacity-0"}`}
                style={go ? { animationDelay: `${200 + i * 380}ms` } : undefined}
              />
            </span>
            <p className="text-[14px] font-bold text-gray-500">{s.when}</p>
            <p
              className={`mt-1 text-[2.4rem] font-black leading-none tracking-[-0.04em] text-[#0A1428] ${go ? "wb-pop-in" : "opacity-0"}`}
              style={go ? { animationDelay: `${300 + i * 380}ms` } : undefined}
            >
              $0
            </p>
            <p className={`mt-2 text-[14px] leading-snug ${s.trial ? "font-bold text-[#C2410C]" : "text-gray-600"}`}>{s.note}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
