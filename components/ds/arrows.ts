/**
 * The app's hand-drawn arrow set (drawn in an 80 x 104 box, pointing down).
 * Plain data, no "use client": the design gallery (a server page) reads
 * the list too. Each head was placed by geometry — tip on the shaft's last
 * point, barbs 32–36° off the shaft's final direction — and
 * scripts/check-arrows.mjs re-checks that no head retraces its shaft.
 */
export const ARROWS = {
  wobble: {
    body: "M40 8 C 46 30, 34 58, 40 94",
    head: "M45 82 L40 94 L29.7 83.7",
    sparks: ["M26 12 L20 9", "M27 20 L21 22", "M31 27 L28 33"],
  },
  ess: {
    body: "M24 8 C 62 22, 16 62, 40 94",
    head: "M38.9 81 L40 94 L26.2 89.6",
    sparks: ["M14 12 L8 9", "M12 20 L6 21", "M16 27 L12 32"],
  },
  curlLeft: {
    body: "M50 8 C 10 10, 14 50, 46 46 C 70 44, 50 70, 40 94",
    head: "M50.6 86.5 L40 94 L36.8 79.9",
    sparks: ["M60 6 L66 3", "M62 14 L68 15", "M58 20 L62 26"],
  },
  curlRight: {
    body: "M30 8 C 70 10, 66 50, 34 46 C 10 44, 30 70, 40 94",
    head: "M42.1 81.2 L40 94 L27.7 86.3",
    sparks: ["M20 6 L14 3", "M18 14 L12 15", "M22 20 L18 26"],
  },
  loop: {
    body: "M36 8 C 44 36, 10 40, 28 52 C 46 64, 62 44, 44 36 C 34 34, 38 70, 40 94",
    head: "M46 82.5 L40 94 L30.6 82.9",
    sparks: ["M24 10 L18 7", "M24 18 L18 19", "M27 25 L23 30"],
  },
  droop: {
    body: "M18 10 C 70 20, 62 70, 42 94",
    head: "M54.4 90 L42 94 L43.1 79.5",
    sparks: ["M10 6 L4 3", "M8 14 L2 15", "M12 20 L9 26"],
  },
  wiggle: {
    body: "M40 8 C 56 24, 24 32, 40 48 C 56 62, 30 68, 38 94",
    head: "M41.4 81.4 L38 94 L26.5 85.2",
    sparks: ["M28 10 L22 7", "M27 18 L21 19", "M30 25 L26 30"],
  },
} as const;

export type ArrowVariant = keyof typeof ARROWS;
export const ARROW_VARIANTS = Object.keys(ARROWS) as ArrowVariant[];
