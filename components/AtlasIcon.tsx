/**
 * The Atlas mark — a compass needle. Atlas → maps → dispatching crews to
 * jobs. This is the one icon for everything AI in the product (assistant
 * bubble, drawer header, setup wizard); never Sparkles, which reads as
 * generic "AI feature" chrome.
 *
 * Two forms:
 *  - AtlasIcon (default): the bare glyph, inherits currentColor like a
 *    lucide icon. Use inline next to text.
 *  - AtlasMark: the full logo lockup — console-ink chamfered tile with the
 *    needle in the company's accent color. Use wherever Atlas has an
 *    identity (drawer header, chat header, mobile tab). The tile stays
 *    #0C0F0C for every tenant (like the sidebar rail); only the needle
 *    takes the brand accent, so any company color reads on it.
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
  // Near-black accents vanish on the ink tile — flip the needle to white.
  const lum = luminanceOf(accent);
  const glyph = lum === null || lum < 70 ? "#FFFFFF" : accent;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* console-ink tile with the signature top-right chamfer */}
      <path d="M0 0H37.5L48 10.5V48H0Z" fill="#0C0F0C" />
      <circle cx="24" cy="24" r="12.3" stroke={glyph} strokeWidth="2.3" />
      <path d="M33.2 14.8 26.8 26.8 21.2 21.2Z" fill={glyph} />
      <path d="M14.8 33.2 21.2 21.2 26.8 26.8Z" fill={glyph} opacity="0.45" />
    </svg>
  );
}
