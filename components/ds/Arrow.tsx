"use client";

import { useEffect, useState } from "react";

/**
 * The app's hand-drawn arrow (design rule 7: "draw" motion). Always points
 * DOWN — label above, target below — and draws itself in with the same
 * stroke animation as the marketing site's WBScribble (globals.css
 * `.wb-scribble`). The marketing site keeps its own arrows; this one is for
 * empty states and hints inside the app.
 *
 * Every arrow in the set was drawn in an 80 x 104 box, and each head was
 * placed by geometry: the tip sits exactly on the shaft's last point and
 * the two barbs leave it 32–36° off the shaft's final direction, so a head
 * can never retrace the shaft (the old "down" arrow doubled back over its
 * own tail). scripts/check-arrows.mjs re-checks that clearance.
 *
 * Which arrow shows is picked at random on mount, so a page that shows
 * several empty states in a row doesn't repeat the same scribble, and the
 * same page draws a different one next visit. Pass `variant` to pin one
 * (the design gallery shows them all).
 */
import { ARROWS, ARROW_VARIANTS, type ArrowVariant } from "./arrows";

export { ARROWS, ARROW_VARIANTS, type ArrowVariant };

// Round-robin through a shuffled deck rather than pure random, so two
// arrows on one screen (or on two visits in a row) are never the same one.
let deck: ArrowVariant[] = [];
function draw(): ArrowVariant {
  if (deck.length === 0) {
    deck = [...ARROW_VARIANTS];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop() as ArrowVariant;
}

export default function Arrow({
  variant,
  delay = 0.3,
  className = "",
}: {
  /** Pin a specific arrow; otherwise one is dealt at random on mount. */
  variant?: ArrowVariant;
  delay?: number;
  className?: string;
}) {
  // Random on the client only — the server can't know which one, and a
  // mismatched path would trip hydration. The slot keeps its size, and the
  // arrow starts drawing after `delay` anyway, so nothing visibly pops.
  const [picked, setPicked] = useState<ArrowVariant | null>(variant ?? null);
  useEffect(() => {
    if (!variant) setPicked(draw());
  }, [variant]);
  const p = picked ? ARROWS[picked] : null;
  return (
    <svg
      viewBox="0 0 80 104"
      fill="none"
      aria-hidden
      className={`wb-scribble pointer-events-none ${className}`}
      style={{ ["--wb-draw-delay" as string]: `${delay}s` }}
      data-arrow={picked ?? undefined}
    >
      {p && (
        <>
          <path d={p.body} pathLength={1} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          <path d={p.head} pathLength={1} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="wb-scribble-late" />
          {p.sparks.map((d) => (
            <path key={d} d={d} pathLength={1} stroke="var(--ds-secondary, #F86A0A)" strokeWidth={2.4} strokeLinecap="round" className="wb-scribble-spark" />
          ))}
        </>
      )}
    </svg>
  );
}
