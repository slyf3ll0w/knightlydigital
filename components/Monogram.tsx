/**
 * Client monogram — saturated gradient circle with initials (the iOS
 * Contacts read). Color is deterministic from the name so a client keeps
 * their color everywhere. These are IDENTITY colors, not section hues —
 * the section rainbow stays confined to the Create/More tiles.
 * theme-fixed: the gradient is self-lit and identical in both themes.
 */

const PALETTE = [
  "#3B82F6",
  "#8B5CF6",
  "#10B981",
  "#F97316",
  "#0EA5E9",
  "#EC4899",
  "#F59E0B",
  "#14B8A6",
];

export default function Monogram({
  name,
  size = 40,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const clean = name.trim() || "?";
  let h = 0;
  for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) >>> 0;
  const base = PALETTE[h % PALETTE.length];
  const initials = clean
    .split(/\s+/)
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`theme-fixed flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.33),
        letterSpacing: "0.01em",
        background: `radial-gradient(130% 130% at 30% 22%, color-mix(in srgb, ${base} 72%, #fff) 0%, ${base} 55%, color-mix(in srgb, ${base} 72%, #000) 100%)`,
      }}
    >
      {initials}
    </span>
  );
}
