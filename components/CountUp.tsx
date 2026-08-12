"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ledger tick — a numeral that counts up to its value on first paint
 * (~450ms, eased out), keeping any prefix/suffix/decimals of the formatted
 * string intact ("$1,234.56" ticks as money). Callers already set tabular
 * figures (.numeral-ledger), so the layout stays still while digits roll.
 * Static under prefers-reduced-motion, for zero values, and for anything
 * that isn't a number. Server-rendered output is the final value, so
 * there's no hydration mismatch — the tick starts on the first client
 * frame.
 */
export default function CountUp({ value }: { value: string | number }) {
  const text = String(value);
  const [display, setDisplay] = useState(text);
  const played = useRef(false);

  useEffect(() => {
    // Later value changes (refresh after a mutation) just show the number —
    // the tick is an entrance, not a live meter.
    if (played.current) {
      setDisplay(text);
      return;
    }
    played.current = true;
    const m = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
    if (!m) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const raw = m[0];
    const target = parseFloat(raw.replace(/,/g, ""));
    if (!isFinite(target) || target === 0) return;
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    const grouped = raw.includes(",");
    const prefix = text.slice(0, m.index);
    const suffix = text.slice(m.index + raw.length);
    const t0 = performance.now();
    const dur = 450;
    let frame: number;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = target * eased;
      setDisplay(
        prefix +
          v.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: grouped,
          }) +
          suffix
      );
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return <>{display}</>;
}
