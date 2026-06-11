/**
 * Deterministic gradient avatar: hue derived from the name so every user
 * gets a stable, distinct color without uploads. Two-letter initials.
 */

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  size = 32,
  className = "",
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const seed = name?.trim() || "?";
  const hue = hashHue(seed);
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white select-none shrink-0 ring-1 ring-white/20 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 62% 48%), hsl(${(hue + 50) % 360} 65% 36%))`,
        letterSpacing: "0.02em",
      }}
      title={name ?? undefined}
    >
      {initials(seed)}
    </div>
  );
}
