"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hand-drawn underline — the "draw" motion for pages that HAVE content
 * (the arrow belongs to empty states; David asked for a second stroke so
 * the arrow never gets overused). A marker stroke in the secondary color
 * draws itself under the page title on load, the way the marketing site
 * underlines a key phrase.
 *
 * Drawn in a 120 x 12 box; the path is re-plotted to the title's real
 * width (x scaled, y kept), so the stroke stays a true 2.4px line — a
 * stretched SVG distorts the stroke and breaks the draw animation's dash. A different stroke is dealt
 * on every mount, like the arrows. It lives in the title's own padding,
 * never over the text (design rule 10).
 */
export const UNDERLINES = {
  swash: { body: "M2 8 C 32 3, 64 11, 118 5" },
  wave: { body: "M2 7 C 30 2, 50 12, 78 6 C 96 2, 108 9, 118 5" },
  rise: { body: "M2 9 C 40 8, 70 3, 118 6" },
  dip: { body: "M2 5 C 36 10, 80 9, 118 4" },
} as const;

export type UnderlineVariant = keyof typeof UNDERLINES;
export const UNDERLINE_VARIANTS = Object.keys(UNDERLINES) as UnderlineVariant[];

let deck: UnderlineVariant[] = [];
function deal(): UnderlineVariant {
  if (deck.length === 0) {
    deck = [...UNDERLINE_VARIANTS];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop() as UnderlineVariant;
}

export default function Underline({
  variant,
  delay = 0.25,
  className = "",
}: {
  variant?: UnderlineVariant;
  delay?: number;
  className?: string;
}) {
  const [picked, setPicked] = useState<UnderlineVariant | null>(variant ?? null);
  const [width, setWidth] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!variant) setPicked(deal());
  }, [variant]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const p = picked && width > 0 ? UNDERLINES[picked] : null;
  // Re-plot x for the measured width (numbers alternate x, y in these paths).
  const k = width / 120;
  const d = p
    ? p.body
        .split(/([\d.]+)/)
        .map((tok, idx) => {
          if (idx % 2 === 0) return tok; // separators
          const nth = (idx - 1) / 2; // 0-based number index: even = x, odd = y
          return nth % 2 === 0 ? String(Math.round(Number(tok) * k * 10) / 10) : tok;
        })
        .join("")
    : "";
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${Math.max(width, 1)} 12`}
      fill="none"
      aria-hidden
      className={`wb-scribble pointer-events-none ${className}`}
      style={{ ["--wb-draw-delay" as string]: `${delay}s` }}
      data-underline={picked ?? undefined}
    >
      {p && (
        <>
          <path d={d} pathLength={1} stroke="var(--ds-secondary, #F86A0A)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
