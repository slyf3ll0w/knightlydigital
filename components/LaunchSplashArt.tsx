import {
  MARK_BAR,
  MARK_LEG_LEFT,
  MARK_LEG_RIGHT,
  MARK_ROUND,
  MARK_W,
  MARK_ORANGE,
  MARK_WHITE,
} from "@/lib/brand-mark";

/**
 * The launch overlay's markup (styles: `.wb-launch` in app/globals.css).
 * Kept free of server-only imports so the client-side replay in /app/design
 * can render the same tree as the shell's server-rendered copy in
 * components/LaunchSplash.tsx.
 */
export function LaunchSplashArt({ id, preview = false }: { id: string; preview?: boolean }) {
  return (
    <div id={id} className="wb-launch" aria-hidden="true" data-preview={preview ? "1" : undefined} suppressHydrationWarning>
      <span className="wb-launch-blob wb-launch-blob-orange" />
      <span className="wb-launch-blob wb-launch-blob-blue" />
      <div className="wb-launch-stack">
        <svg className="wb-launch-mark" viewBox="0 0 1000 1000" role="img" aria-label="WorkBench">
          <g className="wb-launch-w">
            <polygon points={MARK_W} fill={MARK_WHITE} stroke={MARK_WHITE} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
          </g>
          <g className="wb-launch-bar">
            <polygon points={MARK_BAR} fill={MARK_WHITE} stroke={MARK_WHITE} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
          </g>
          <g className="wb-launch-leg wb-launch-leg-l">
            <polygon points={MARK_LEG_LEFT} fill={MARK_ORANGE} stroke={MARK_ORANGE} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
          </g>
          <g className="wb-launch-leg wb-launch-leg-r">
            <polygon points={MARK_LEG_RIGHT} fill={MARK_ORANGE} stroke={MARK_ORANGE} strokeWidth={MARK_ROUND} strokeLinejoin="round" />
          </g>
        </svg>
        <p className="wb-launch-word">
          <span>Work</span>
          <span className="wb-launch-word-accent">Bench</span>
        </p>
      </div>
    </div>
  );
}
