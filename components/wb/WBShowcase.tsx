"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * FreshBooks-style product showcase: a browser frame that auto-slides
 * between real app screenshots, with tab pills to jump around. Auto-play
 * pauses on hover/focus and respects prefers-reduced-motion.
 */

const slides = [
  {
    key: "dashboard",
    label: "Dashboard",
    src: "/screens/desktop-dashboard.jpg",
    alt: "WorkBench dashboard with revenue stats, the Needs-you list, and today's schedule",
  },
  {
    key: "schedule",
    label: "Schedule",
    src: "/screens/desktop-schedule.jpg",
    alt: "WorkBench schedule with drag-to-schedule calendar views",
  },
  {
    key: "jobs",
    label: "Jobs",
    src: "/screens/desktop-jobs.jpg",
    alt: "WorkBench jobs list with status filters",
  },
  {
    key: "quotes",
    label: "Quotes",
    src: "/screens/desktop-quotes.jpg",
    alt: "A WorkBench quote with line items, awaiting client approval",
  },
  {
    key: "invoices",
    label: "Invoices",
    src: "/screens/desktop-invoices.jpg",
    alt: "WorkBench invoices with card and ACH payment status",
  },
];

const INTERVAL_MS = 5000;

export default function WBShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Tab pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setIndex(i)}
            aria-pressed={i === index}
            className={`rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors ${
              i === index
                ? "bg-[#0B57D8] text-white"
                : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:text-gray-900"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Browser frame */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_60px_rgba(10,20,40,0.16)]">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" aria-hidden />
          <span className="ml-3 hidden flex-1 justify-center sm:flex">
            <span className="rounded-md bg-white px-6 py-1 text-[11.5px] font-semibold text-gray-400 ring-1 ring-inset ring-gray-200">
              workbenchfsm.com/app
            </span>
          </span>
          <span className="w-[54px]" aria-hidden />
        </div>
        <div className="relative aspect-[1512/791]">
          {slides.map((s, i) => (
            <Image
              key={s.key}
              src={s.src}
              alt={s.alt}
              fill
              sizes="(min-width: 1152px) 1100px, 100vw"
              className={`object-cover transition-opacity duration-500 ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={i !== index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
