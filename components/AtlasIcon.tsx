/**
 * The Atlas mark — a compass needle. Atlas → maps → dispatching crews to
 * jobs. This is the one icon for everything AI in the product (assistant
 * bubble, drawer header, setup wizard); never Sparkles, which reads as
 * generic "AI feature" chrome.
 *
 * Two forms:
 *  - AtlasIcon (default): the bare glyph, inherits currentColor like a
 *    lucide icon. Use inline next to text.
 *  - AtlasMark: the full logo lockup — a circular badge filled with the
 *    company's accent color (subtle top-light gradient) and the compass
 *    glyph knocked out in white (or ink, on very light accents). Use
 *    wherever Atlas has an identity (drawer header, chat header, mobile
 *    tab). Replaced the old ink chamfer tile 2026-07-14 — David wanted a
 *    friendlier avatar for the chat.
 */

const NEEDLE_NE = "M16.8 7.2 13.6 13.6 10.4 10.4Z";
const NEEDLE_SW = "M7.2 16.8 10.4 10.4 13.6 13.6Z";

export default function AtlasIcon({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.1" stroke="currentColor" strokeWidth="1.8" />
      {/* needle: solid NE half, ghosted SW half — fills stay crisp at 15px
          where the old stroked half-needle collapsed into mush */}
      <path d={NEEDLE_NE} fill="currentColor" />
      <path d={NEEDLE_SW} fill="currentColor" opacity="0.45" />
    </svg>
  );
}

/** Perceived luminance 0–255; null if not a 6-digit hex. */
function luminanceOf(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** Shift a hex color toward white (amount > 0) or black (amount < 0), 0–1. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => {
    const t = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(t)));
  };
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function AtlasMark({
  size = 32,
  accent = "#22C55E",
  className = "",
}: {
  size?: number;
  /** Company brand accent (brandAccent(company)); defaults to Streamflaire green. */
  accent?: string;
  className?: string;
}) {
  const lum = luminanceOf(accent);
  const base = lum === null ? "#22C55E" : accent;
  // Very light accents (pale yellows, near-white) need an ink glyph.
  const glyph = lum !== null && lum > 165 ? "#0C0F0C" : "#FFFFFF";
  // Gradient id must be unique per accent — two marks with different accents
  // can share one document, and SVG defs are document-global.
  const gid = `atlas-badge-${base.replace("#", "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="10" y1="4" x2="38" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor={shade(base, 0.22)} />
          <stop offset="1" stopColor={shade(base, -0.18)} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${gid})`} />
      {/* hairline bevel so the badge doesn't melt into same-hue backgrounds */}
      <circle cx="24" cy="24" r="23.25" stroke={glyph} strokeOpacity="0.25" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="12" stroke={glyph} strokeWidth="2.2" />
      <path d="M33 15 26.7 26.7 21.3 21.3Z" fill={glyph} />
      <path d="M15 33 21.3 21.3 26.7 26.7Z" fill={glyph} opacity="0.45" />
    </svg>
  );
}
