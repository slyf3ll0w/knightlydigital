import Link from "next/link";

/**
 * "How far back" — a time ruler that starts at Today (left), each period a stop on it
 * (spaced by log of its length, so 30 days and 90 days don't crowd). The
 * picked period is the shaded stretch from Today to its stop. Replaces a row
 * of range pills (Reports → Insights, 2026-11-23).
 */
export type RangeStop = { value: string; label: string; days: number };

export default function RangeRuler({
  stops,
  active,
  href,
  label = "Period",
}: {
  stops: RangeStop[];
  active: string;
  href: (value: string) => string;
  label?: string;
}) {
  const longest = Math.max(...stops.map((s) => s.days));
  const shortest = Math.min(...stops.map((s) => s.days));
  // Reads left to right (David, 2026-11-23): Today at the left edge, then
  // further back the further right — log spaced from 22% (shortest) to 94% (longest).
  const lo = Math.log(shortest);
  const hi = Math.log(longest);
  const at = (days: number) => (hi === lo ? 60 : 22 + ((Math.log(days) - lo) / (hi - lo)) * 72);
  const picked = stops.find((s) => s.value === active) ?? stops[0];
  return (
    <nav aria-label={label} className="ds-ruler">
      <div className="ds-ruler-track" aria-hidden>
        <span className="ds-ruler-span" style={{ width: `${at(picked.days)}%` }} />
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className="ds-ruler-tick" style={{ left: `${(i / 24) * 100}%` }} />
        ))}
      </div>
      {stops.map((s) => (
        <Link
          key={s.value}
          href={href(s.value)}
          prefetch={false}
          aria-current={s.value === picked.value ? "true" : undefined}
          className="ds-ruler-stop"
          style={{ left: `${at(s.days)}%` }}
        >
          <span className="ds-ruler-dot" aria-hidden />
          <span className="ds-ruler-label">{s.label}</span>
        </Link>
      ))}
      <span className="ds-ruler-today" aria-hidden>
        <span className="ds-ruler-dot" />
        <span className="ds-ruler-label">Today</span>
      </span>
    </nav>
  );
}
