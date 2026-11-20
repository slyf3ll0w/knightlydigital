import { MARK_BAR, MARK_BLUE, MARK_LEG_LEFT, MARK_LEG_RIGHT, MARK_ORANGE, MARK_ROUND, MARK_W, MARK_WHITE } from "@/lib/brand-mark";

/**
 * The current WorkBench app icon (the flat mark on its blue square, drawn
 * from lib/brand-mark.ts — the same geometry as the store icon and splash).
 * Use this wherever the site shows the app icon: push banners, the "Built
 * with WorkBench" note, the live app's corner. Never the old beveled PNGs
 * (/apple-icon.png, /workbench-icon.png). Size and corner come from className.
 */
export default function WBAppIcon({ className = "h-8 w-8 rounded-lg" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={`flex-none overflow-hidden ${className}`} aria-hidden>
      <rect width="1000" height="1000" fill={MARK_BLUE} />
      {(
        [
          [MARK_W, MARK_WHITE],
          [MARK_BAR, MARK_WHITE],
          [MARK_LEG_LEFT, MARK_ORANGE],
          [MARK_LEG_RIGHT, MARK_ORANGE],
        ] as const
      ).map(([pts, fill]) => (
        <polygon key={pts} points={pts} fill={fill} stroke={fill} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
