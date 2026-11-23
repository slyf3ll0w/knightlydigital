import Link from "next/link";

/**
 * "How far back" — a time ruler that ends at Today, each period a stop on it
 * (spaced by log of its length, so 30 days and 90 days don't crowd). The
 * picked period is the shaded stretch from its stop to Today. Replaces a row
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
  // log spacing from 8% (longest) to 78% (shortest); Today sits at the far end.
  const lo = Math.log(shortest);
  const hi = Math.log(longest);
  const at = (days: number) => (hi === lo ? 50 : 8 + ((hi - Math.log(days)) / (hi - lo)) * 70);
  const picked = stops.find((s) => s.value === active) ?? stops[0];
  return (
    <nav aria-label={label} className="ds-ruler">
      <div className="ds-ruler-track" aria-hidden>
        <span className="ds-ruler-span" style={{ left: `${at(picked.days)}%` }} />
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
