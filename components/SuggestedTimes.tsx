"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * "Find a Time" chips — drive-time-aware start-time suggestions, shared by
 * every scheduler (job detail panel, new job, appointments). Give it a day, a
 * team member, and where the work is; it renders tappable start times ranked
 * by least added driving (the best one gets the green treatment, matching
 * Jobber's convention). Picking a chip fills the start/end inputs via onPick —
 * nothing is saved until the host form saves.
 */

type Suggestion = {
  start: string;
  end: string;
  driveFromPrev: number | null;
  driveToNext: number | null;
  prevTitle: string | null;
  nextTitle: string | null;
  totalDriveMinutes: number | null;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function SuggestedTimes({
  date,
  userId,
  address,
  durationMinutes,
  excludeId,
  onPick,
}: {
  /** Day to search, YYYY-MM-DD. Empty = render nothing. */
  date: string;
  /** Whose route to fit into. Empty = render nothing. */
  userId: string;
  address?: string | null;
  durationMinutes?: number;
  excludeId?: string;
  onPick: (startLocal: string, endLocal: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [driveAware, setDriveAware] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const key = useMemo(
    () => JSON.stringify([date, userId, address ?? "", durationMinutes ?? 0, excludeId ?? ""]),
    [date, userId, address, durationMinutes, excludeId]
  );

  useEffect(() => {
    if (!date || !userId) {
      setSuggestions([]);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    // Debounced: typing an address shouldn't fire a request per keystroke
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/app/schedule/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, userId, address, durationMinutes, excludeId }),
        });
        if (mine !== seq.current) return;
        if (res.ok) {
          const data = (await res.json()) as { driveAware: boolean; suggestions: Suggestion[] };
          setSuggestions(data.suggestions ?? []);
          setDriveAware(Boolean(data.driveAware));
        } else {
          setSuggestions([]);
        }
      } catch {
        if (mine === seq.current) setSuggestions([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!date || !userId || (!loading && suggestions.length === 0)) return null;

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
        <Sparkles size={12} className="text-green-600" />
        Suggested times
        {driveAware && <span className="text-gray-400">— least driving first</span>}
        {loading && <Loader2 size={11} className="animate-spin text-gray-400" />}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s, i) => {
          const best = i === 0 && s.totalDriveMinutes != null;
          return (
            <button
              key={s.start}
              type="button"
              onClick={() => onPick(toLocalInput(s.start), toLocalInput(s.end))}
              title={
                [
                  s.driveFromPrev != null && s.prevTitle
                    ? `~${s.driveFromPrev} min from ${s.prevTitle}`
                    : null,
                  s.driveToNext != null && s.nextTitle
                    ? `~${s.driveToNext} min to ${s.nextTitle}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
              className={`rounded-[9px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                best
                  ? "btn-tool bg-green-500 text-white hover:bg-green-600"
                  : "btn-tool-line bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {timeLabel(s.start)}
              {s.totalDriveMinutes != null && (
                <span className={`numeral-ledger ml-1.5 font-medium ${best ? "text-green-100" : "text-gray-400"}`}>
                  ~{s.totalDriveMinutes}m drive
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
