"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Car } from "lucide-react";
import { localInputToISO } from "@/lib/statuses";

/**
 * The live "heads up" under a form's time fields (David 2026-10-06): while
 * someone picks a time and people, ask POST /api/app/schedule/check whether
 * anyone is already booked then, or can't drive there (or on to their next
 * stop) in time. Shows nothing while it's all clear. Never blocks a save.
 */
export type ScheduleCheckInput = {
  /** `YYYY-MM-DDTHH:mm` local values, as the time pickers hold them. */
  start: string;
  end: string;
  userIds: string[];
  /** On-site work (a job, an in-person appointment) — checks drive time too. */
  onSite: boolean;
  address?: string | null;
  propertyId?: string | null;
  contactId?: string | null;
  excludeJobId?: string;
  excludeAppointmentId?: string;
};

export type ScheduleCheckResult = { conflicts: string[]; drive: string[] };

export function useScheduleCheck(input: ScheduleCheckInput | null): ScheduleCheckResult | null {
  const [result, setResult] = useState<ScheduleCheckResult | null>(null);
  const key = input ? JSON.stringify(input) : "";
  useEffect(() => {
    if (!input || input.start.length < 16 || input.end.length < 16 || input.userIds.length === 0) {
      setResult(null);
      return;
    }
    const ctrl = new AbortController();
    // Settle first: typing a time fires a change per keystroke
    const t = window.setTimeout(() => {
      fetch("/api/app/schedule/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          ...input,
          start: localInputToISO(input.start),
          end: localInputToISO(input.end),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ScheduleCheckResult | null) => {
          if (d) setResult({ conflicts: d.conflicts ?? [], drive: d.drive ?? [] });
        })
        .catch(() => {});
    }, 450);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result;
}

export default function ScheduleHeadsUp({ result }: { result: ScheduleCheckResult | null }) {
  if (!result || (result.conflicts.length === 0 && result.drive.length === 0)) return null;
  return (
    <div
      role="status"
      className="rounded-xl bg-[color:var(--ds-warn-soft)] px-3 py-2.5 text-[13px] text-gray-800"
    >
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-[color:var(--ds-warn)]">
        <AlertTriangle size={14} className="shrink-0" /> Heads up — you can still save
      </p>
      <ul className="space-y-1">
        {result.conflicts.map((c) => (
          <li key={c} className="flex gap-1.5">
            <span aria-hidden className="shrink-0">·</span>
            <span>Overlaps {c}</span>
          </li>
        ))}
        {result.drive.map((c) => (
          <li key={c} className="flex gap-1.5">
            <Car size={13} className="mt-0.5 shrink-0" />
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
