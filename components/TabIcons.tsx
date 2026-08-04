/**
 * Filled tab-bar glyphs (Daylight & Dusk chrome). Lucide is a stroke set —
 * the tab bar wants chunky filled silhouettes (the Venmo/native-app read),
 * so these are hand-drawn on the same 24-grid. Interior cutouts use
 * fill-rule punches, so they stay transparent on the blurred bar instead
 * of carrying a hardcoded background color.
 */

type GlyphProps = { size?: number; className?: string };

export function HomeFill({ size = 24, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.05 3.62a1.5 1.5 0 0 1 1.9 0l7.6 6.24a1 1 0 0 1-.63 1.77H19v6.87A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-6.87h-.92a1 1 0 0 1-.63-1.77Zm-1.05 16 0-4.52a1.2 1.2 0 0 1 1.2-1.2h1.6a1.2 1.2 0 0 1 1.2 1.2V19.62Z"
      />
    </svg>
  );
}

export function ScheduleFill({ size = 24, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M7.15 3.1a.95.95 0 0 1 .95.95v1.2h7.8v-1.2a.95.95 0 0 1 1.9 0v1.22a2.6 2.6 0 0 1 2.3 2.58v9.55A2.6 2.6 0 0 1 17.5 20h-11a2.6 2.6 0 0 1-2.6-2.6V7.85a2.6 2.6 0 0 1 2.3-2.58V4.05a.95.95 0 0 1 .95-.95ZM5.7 9.9v7.5a.8.8 0 0 0 .8.8h11a.8.8 0 0 0 .8-.8V9.9Zm2.1 2.2h2.9v2.5H7.8Zm4.7 0h2.9v2.5h-2.9Z"
      />
    </svg>
  );
}

export function MoreFill({ size = 24, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M6.6 4.2h2.3a2.4 2.4 0 0 1 2.4 2.4v2.3a2.4 2.4 0 0 1-2.4 2.4H6.6a2.4 2.4 0 0 1-2.4-2.4V6.6a2.4 2.4 0 0 1 2.4-2.4Zm8.5 0h2.3a2.4 2.4 0 0 1 2.4 2.4v2.3a2.4 2.4 0 0 1-2.4 2.4h-2.3a2.4 2.4 0 0 1-2.4-2.4V6.6a2.4 2.4 0 0 1 2.4-2.4Zm-8.5 8.5h2.3a2.4 2.4 0 0 1 2.4 2.4v2.3a2.4 2.4 0 0 1-2.4 2.4H6.6a2.4 2.4 0 0 1-2.4-2.4v-2.3a2.4 2.4 0 0 1 2.4-2.4Zm8.5 0h2.3a2.4 2.4 0 0 1 2.4 2.4v2.3a2.4 2.4 0 0 1-2.4 2.4h-2.3a2.4 2.4 0 0 1-2.4-2.4v-2.3a2.4 2.4 0 0 1 2.4-2.4Z"
      />
    </svg>
  );
}

export function ChatFill({ size = 24, className }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M7.6 4.3h8.8a3.7 3.7 0 0 1 3.7 3.7v4.8a3.7 3.7 0 0 1-3.7 3.7H10l-4.35 3.15A1 1 0 0 1 4.06 18.9L3.9 8A3.7 3.7 0 0 1 7.6 4.3Zm.75 5.55a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm3.65 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm3.65 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
      />
    </svg>
  );
}
