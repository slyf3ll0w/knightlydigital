/**
 * A hand-drawn marker stroke on a word in a headline, the same ink as the
 * hand-drawn notes (WBScribble): an orange swoosh under it ("under") or a
 * loose loop around it ("circle"). It draws itself in when its AnimateIn
 * parent reveals (globals.css .wb-scribble). Decorative only.
 */
const SHAPES = {
  under: {
    viewBox: "0 0 200 24",
    paths: ["M4 15 C 46 7, 118 4, 196 10", "M30 20 C 80 14, 140 13, 186 16"],
    box: "left-[-3%] w-[106%] -bottom-[0.16em] h-[0.36em]",
  },
  circle: {
    viewBox: "0 0 200 80",
    paths: ["M118 8 C 66 2, 14 12, 8 38 C 3 62, 70 76, 128 70 C 180 64, 198 44, 186 24 C 176 9, 140 4, 96 7"],
    box: "-left-[18%] -top-[26%] w-[136%] h-[152%]",
  },
} as const;

export default function WBMarker({
  children,
  shape = "under",
  delay = 0.5,
}: {
  children: React.ReactNode;
  shape?: keyof typeof SHAPES;
  delay?: number;
}) {
  const s = SHAPES[shape];
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        viewBox={s.viewBox}
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
        className={`wb-scribble pointer-events-none absolute ${s.box}`}
        style={{ ["--wb-draw-delay" as string]: `${delay}s` }}
      >
        {s.paths.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            stroke="#F86A0A"
            strokeWidth={i === 0 ? 4 : 2.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className={i > 0 ? "wb-scribble-late" : undefined}
          />
        ))}
      </svg>
    </span>
  );
}
