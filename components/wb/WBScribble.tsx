/**
 * A hand-drawn arrow for the marketing pages — navy ink with orange spark
 * ticks, drawn in on load (or when its AnimateIn parent reveals). Points
 * a label at a piece of the product the way a person would with a marker.
 *
 * `variant` picks the stroke: "loop" curls once on the way (label beside
 * the target), "swoop" is one easy arc (label above / across a gap). Flip
 * with `flip` (mirror left-right) and rotate with CSS on the wrapper.
 */

const PATHS = {
  loop: {
    viewBox: "0 0 140 90",
    body: "M8 14 C 34 4, 66 8, 70 34 C 73 54, 50 62, 45 47 C 40 32, 66 24, 86 38 C 102 49, 114 62, 126 74",
    head: "M111 73 L127 75 L122 60",
    sparks: ["M6 30 L1 34", "M12 34 L10 40", "M19 32 L20 38"],
  },
  swoop: {
    viewBox: "0 0 140 70",
    body: "M6 50 C 30 18, 76 6, 104 22 C 116 29, 124 38, 130 48",
    head: "M116 46 L131 50 L131 35",
    sparks: ["M4 38 L0 34", "M10 34 L9 28", "M17 33 L20 27"],
  },
} as const;

export default function WBScribble({
  variant = "loop",
  flip = false,
  tone = "ink",
  delay = 0.3,
  className = "",
}: {
  variant?: keyof typeof PATHS;
  flip?: boolean;
  /** "ink" = navy for light bands, "chalk" = white for dark bands and photos. */
  tone?: "ink" | "chalk";
  delay?: number;
  className?: string;
}) {
  const p = PATHS[variant];
  const ink = tone === "chalk" ? "#FFFFFF" : "#10244A";
  return (
    <svg
      viewBox={p.viewBox}
      fill="none"
      aria-hidden
      className={`wb-scribble pointer-events-none ${className}`}
      style={{ transform: flip ? "scaleX(-1)" : undefined, ["--wb-draw-delay" as string]: `${delay}s` }}
    >
      <path d={p.body} pathLength={1} stroke={ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d={p.head} pathLength={1} stroke={ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="wb-scribble-late" />
      {p.sparks.map((d) => (
        <path key={d} d={d} pathLength={1} stroke="#F86A0A" strokeWidth={2.4} strokeLinecap="round" className="wb-scribble-spark" />
      ))}
    </svg>
  );
}
