"use client";

import { useEffect, useState } from "react";

/**
 * The balance due rolls up to its value once, as the card lands — the one
 * moving number on the portal home. The server renders the final figure
 * (no JS, no motion = the right number); reduced motion skips the roll.
 */
export default function HubCountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!(value > 0)) return;
    const start = performance.now();
    const ms = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(t >= 1 ? value : Math.round(value * eased * 100) / 100);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setShown(value);
    };
  }, [value]);

  return (
    <span className={className} aria-label={fmt(value)}>
      <span aria-hidden>{fmt(shown)}</span>
    </span>
  );
}

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
