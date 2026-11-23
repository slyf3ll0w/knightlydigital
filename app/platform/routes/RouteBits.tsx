/**
 * Small pictures for the Routes panel (heavy pilot round 6):
 * - DayRibbon: one crew's day as a strip, each stop a block at its time and
 *   length, the gaps are driving / free time, a "now" tick on today.
 * - CrewPicker: the team as initials circles in their route colors instead
 *   of a dropdown (falls back to the dropdown past 8 people).
 * - EmptyRouteArt: a drawn route for the empty day.
 */

type RibbonStop = {
  id: string;
  title: string;
  kind: string;
  progress: "pending" | "active" | "done";
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  durationMin: number | null;
};

function clock(ms: number, tz: string): string {
  try {
    return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  } catch {
    return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

export function DayRibbon({ stops, color, tz, now }: { stops: RibbonStop[]; color: string; tz: string; now?: number | null }) {
  const timed = stops
    .filter((s) => !s.scheduledAnytime && s.scheduledAt)
    .map((s) => {
      const a = new Date(s.scheduledAt!).getTime();
      const b = s.scheduledEnd ? new Date(s.scheduledEnd).getTime() : a + (s.durationMin ?? 60) * 60_000;
      return { s, a, b: Math.max(b, a + 10 * 60_000) };
    });
  if (timed.length === 0) return null;
  const min = Math.min(...timed.map((t) => t.a));
  const max = Math.max(...timed.map((t) => t.b));
  const span = Math.max(max - min, 30 * 60_000);
  const pct = (ms: number) => ((ms - min) / span) * 100;
  const showNow = now != null && now > min && now < max;
  return (
    <div className="route-ribbon" style={{ ["--tech" as string]: color }}>
      <div className="route-ribbon-track" role="img" aria-label={`The day runs ${clock(min, tz)} to ${clock(max, tz)}`}>
        {timed.map(({ s, a, b }, i) => (
          <span
            key={s.id}
            className={`route-ribbon-seg is-${s.progress} ${s.kind === "break" ? "is-break" : ""}`}
            style={{ left: `${pct(a)}%`, width: `max(4px, ${pct(b) - pct(a)}%)`, ["--i" as string]: i }}
            title={`${clock(a, tz)} · ${s.title}`}
          />
        ))}
        {showNow && <span className="route-ribbon-now" style={{ left: `${pct(now!)}%` }} title={`Now · ${clock(now!, tz)}`} />}
      </div>
      <div className="route-ribbon-ends">
        <span>{clock(min, tz)}</span>
        <span>{clock(max, tz)}</span>
      </div>
    </div>
  );
}

export function CrewPicker({
  people,
  team,
  onPick,
  meId,
}: {
  people: { id: string; name: string; color: string }[];
  team: string;
  onPick: (id: string) => void;
  meId: string;
}) {
  const initials = (n: string) =>
    n
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  return (
    <div className="route-crew-pick" role="group" aria-label="Crew">
      <button type="button" aria-pressed={team === ""} onClick={() => onPick("")} className={`route-crew-all ${team === "" ? "is-on" : ""}`}>
        Everyone
      </button>
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={team === p.id}
          aria-label={p.id === meId ? `${p.name} (me)` : p.name}
          title={p.id === meId ? `${p.name} (me)` : p.name}
          onClick={() => onPick(team === p.id ? "" : p.id)}
          className={`route-crew-face ${team === p.id ? "is-on" : ""} ${team && team !== p.id ? "is-dim" : ""}`}
          style={{ ["--tech" as string]: p.color }}
        >
          {initials(p.name)}
        </button>
      ))}
    </div>
  );
}

export function EmptyRouteArt() {
  return (
    <svg className="route-empty-art" width="132" height="56" viewBox="0 0 132 56" fill="none" aria-hidden>
      <path className="route-empty-path" d="M10 44C30 44 30 14 52 14S70 40 90 40 104 12 122 12" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
      <rect x="4" y="38" width="12" height="12" rx="3.5" className="route-empty-hq" />
      <circle cx="52" cy="14" r="6" className="route-empty-pin" />
      <circle cx="90" cy="40" r="6" className="route-empty-pin" />
      <circle cx="122" cy="12" r="6" className="route-empty-pin" />
    </svg>
  );
}
