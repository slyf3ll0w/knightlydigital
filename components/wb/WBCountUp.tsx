"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from zero the first time it scrolls into view
 * (David 2026-11-18). Pass the real value from lib/plans.ts etc., never a
 * typed price. Shows the final value at once under reduced motion, and the
 * server renders the final value too, so the number is right without JS.
 */
export default function WBCountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  ms = 1400,
  className = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  ms?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    setShown(0);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || done.current) return;
        done.current = true;
        const start = performance.now();
        const run = (t: number) => {
          const k = Math.min(1, (t - start) / ms);
          setShown(value * (1 - Math.pow(1 - k, 3)));
          if (k < 1) requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, ms]);

  const text = shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
