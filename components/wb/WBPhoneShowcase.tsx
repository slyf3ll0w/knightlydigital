"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * The iPhone app in a device frame, auto-sliding through real App Store
 * screenshots. Pauses on hover and respects prefers-reduced-motion. `tone`
 * picks the caption colors for a light or a navy band.
 */

const slides = [
  { src: "/screens/mobile-01.png", caption: "Today at a glance" },
  { src: "/screens/mobile-02.png", caption: "The day's schedule" },
  { src: "/screens/mobile-05.png", caption: "Jobs with a built-in time clock" },
  { src: "/screens/mobile-04.png", caption: "Invoices from the field" },
  { src: "/screens/mobile-03.png", caption: "Team chat" },
  { src: "/screens/mobile-06.png", caption: "Atlas and everything else" },
];

const INTERVAL_MS = 3800;

export default function WBPhoneShowcase({ tone = "light" }: { tone?: "light" | "dark" }) {
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

  const dark = tone === "dark";

  return (
    <div
      className="flex flex-col items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Device frame */}
      <div
        className={`rounded-[3rem] p-[10px] ${
          dark
            ? "bg-[#1B2740] shadow-[0_30px_70px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
            : "bg-gray-900 shadow-[0_24px_60px_rgba(10,20,40,0.28)]"
        }`}
      >
        <div className="relative w-[248px] overflow-hidden rounded-[2.4rem] bg-white sm:w-[268px]" style={{ aspectRatio: "331 / 720" }}>
          {slides.map((s, i) => (
            <Image
              key={s.src}
              src={s.src}
              alt={s.caption}
              fill
              sizes="268px"
              className={`object-cover transition-opacity duration-500 ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={i !== index}
            />
          ))}
        </div>
      </div>

      {/* Caption + dots */}
      <p className={`mt-5 h-5 text-[14px] font-bold ${dark ? "text-white" : "text-gray-900"}`} aria-live="polite">
        {slides[index].caption}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show: ${s.caption}`}
            aria-pressed={i === index}
            className={`h-2 rounded-full transition-all ${
              i === index
                ? "w-6 bg-[#F86A0A]"
                : dark
                  ? "w-2 bg-white/30 hover:bg-white/50"
                  : "w-2 bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
