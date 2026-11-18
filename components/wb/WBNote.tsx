import WBScribble from "@/components/wb/WBScribble";

/**
 * A hand-written note with its hand-drawn arrow (the site's marker style,
 * David 2026-11-18: "utilize the arrows more"). The arrow draws itself when
 * the note's AnimateIn parent scrolls into view (globals.css .wb-scribble).
 *
 * `arrow` picks where the arrow sits relative to the words:
 *   "right"  words then a swoop to the right (points right / down-right)
 *   "left"   a mirrored swoop before the words (points left)
 *   "down"   words over a downward loop (points down)
 * Position the note yourself (absolute, usually lg/xl only) next to what it
 * points at. Notes are decorative: aria-hidden.
 */
export default function WBNote({
  children,
  arrow = "right",
  tone = "ink",
  delay = 0.4,
  className = "",
  arrowClassName = "",
}: {
  children: React.ReactNode;
  arrow?: "right" | "left" | "down";
  tone?: "ink" | "chalk";
  delay?: number;
  className?: string;
  arrowClassName?: string;
}) {
  const text = (
    <span className={`block font-extrabold leading-snug ${tone === "chalk" ? "text-white" : "text-[#10244A]"} text-[15px]`}>{children}</span>
  );
  if (arrow === "down") {
    return (
      <div className={`flex flex-col items-center gap-1 ${className}`} aria-hidden>
        {text}
        <WBScribble variant="down" tone={tone} delay={delay} className={`h-[64px] w-[50px] ${arrowClassName}`} />
      </div>
    );
  }
  return (
    <div className={`flex items-end gap-1.5 ${arrow === "left" ? "flex-row-reverse text-left" : "text-right"} ${className}`} aria-hidden>
      {text}
      <WBScribble variant="swoop" flip={arrow === "left"} tone={tone} delay={delay} className={`h-[46px] w-[92px] flex-none ${arrowClassName}`} />
    </div>
  );
}
