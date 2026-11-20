"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that rolls into place like an odometer the first time it scrolls
 * into view: every digit is a strip of 0–9 that spins down to its value,
 * the left-most digits settling last (the home counter, David 2026-11-19:
 * "the bottom sections need some pizzaz"). Shows the real value at once
 * without JS or under reduced motion.
 */
export default function WBOdometer({ value, money = false, className = "" }: { value: number; money?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
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
      { threshold: 0.4 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const text = money
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : Math.floor(value).toLocaleString("en-US");
  const digits = text.split("").filter((c) => /\d/.test(c)).length;
  let seen = 0;

  return (
    <span ref={ref} className={`inline-flex tabular-nums ${className}`} aria-label={text}>
      {text.split("").map((c, k) => {
        if (!/\d/.test(c)) return <span key={k} aria-hidden>{c}</span>;
        const d = Number(c);
        const place = digits - seen++; // 1 = right-most
        return (
          <span key={k} className="relative inline-block h-[1em] overflow-hidden leading-none" aria-hidden>
            <span
              className="flex flex-col transition-transform ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{
                transform: `translateY(-${(go ? d + 10 : 0) * 10 / 2}%)`,
                transitionDuration: go ? `${1400 + place * 220}ms` : "0ms",
              }}
            >
              {Array.from({ length: 20 }).map((_, n) => (
                <span key={n} className="block h-[1em] leading-none">
                  {n % 10}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
