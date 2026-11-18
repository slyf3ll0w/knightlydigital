/**
 * A hand-written note with a hand-drawn arrow (the site's marker style,
 * redrawn 2026-11-18 round 4 after David: "the arrows are drawn wrong and
 * are drawn under things").
 *
 * The arrow is drawn for its job, never rotated with CSS: one easy arc that
 * leaves the words level and comes down into the target, the head aimed
 * along the line's last stretch. `side` says which side of the target the
 * note sits on ("left" = note on the left, arrow pointing right). The arrow
 * sits above whatever it points into (z-20 on the note), and draws itself
 * when its AnimateIn parent scrolls into view (globals.css .wb-scribble).
 *
 * Place the note absolutely so its arrow TIP lands on the thing: for a
 * left note, set `right` so the container's right edge is where the tip
 * goes; for a right note, set `left`. Decorative: aria-hidden.
 */
export default function WBNote({
  children,
  side = "left",
  tone = "ink",
  delay = 0.4,
  length = 150,
  className = "",
}: {
  children: React.ReactNode;
  side?: "left" | "right";
  tone?: "ink" | "chalk";
  delay?: number;
  /** Arrow width in px (the arc scales with it). */
  length?: number;
  className?: string;
}) {
  const ink = tone === "chalk" ? "#FFFFFF" : "#10244A";
  // Drawn in a 120 x 40 box: leaves at the left middle, arcs, lands bottom right.
  // Head arms are the last tangent rotated +/-30deg, 14 units long.
  const arrow = (
    <svg
      viewBox="0 0 120 40"
      fill="none"
      className="wb-scribble flex-none overflow-visible"
      style={{ width: length, height: (length * 40) / 120, transform: side === "right" ? "scaleX(-1)" : undefined, ["--wb-draw-delay" as string]: `${delay}s` }}
      aria-hidden
    >
      <path d="M4 12 C 40 2, 86 6, 116 34" pathLength={1} stroke={ink} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M112 20.6 L116 34 L102.4 30.9" pathLength={1} stroke={ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="wb-scribble-late" />
      <path d="M2 4 L-3 0" pathLength={1} stroke="#F86A0A" strokeWidth={2.4} strokeLinecap="round" className="wb-scribble-spark" />
      <path d="M7 1 L6 -5" pathLength={1} stroke="#F86A0A" strokeWidth={2.4} strokeLinecap="round" className="wb-scribble-spark" />
    </svg>
  );
  const text = (
    <span className={`block whitespace-nowrap text-[16px] font-extrabold leading-snug ${tone === "chalk" ? "text-white" : "text-[#10244A]"} ${side === "left" ? "text-right" : "text-left"}`}>
      {children}
    </span>
  );
  return (
    <div className={`pointer-events-none flex items-start gap-2 ${className}`} aria-hidden>
      {side === "left" ? (
        <>
          {text}
          <span className="mt-2">{arrow}</span>
        </>
      ) : (
        <>
          <span className="mt-2">{arrow}</span>
          {text}
        </>
      )}
    </div>
  );
}
