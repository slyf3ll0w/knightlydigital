"use client";

import { useEffect, useState } from "react";

/**
 * Appointment purposes / job titles this person typed before, newest first
 * (lib/recent-titles.ts). Forms start from the last one and offer the rest
 * as suggestions through a native <datalist> — a dropdown on desktop, the
 * keyboard's suggestion bar on phones.
 */
type Kind = "appointment" | "job";
let cache: Promise<Record<Kind, string[]>> | null = null;

export function useRecentTitles(kind: Kind): string[] | null {
  const [list, setList] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    cache ??= fetch("/api/app/profile/recent-titles")
      .then((r) => (r.ok ? r.json() : { appointment: [], job: [] }))
      .catch(() => ({ appointment: [], job: [] }));
    cache.then((d) => {
      if (alive) setList(Array.isArray(d?.[kind]) ? d[kind] : []);
    });
    return () => {
      alive = false;
    };
  }, [kind]);
  return list;
}

/** Forget the cached list after a save, so the next form sees the new title. */
export function refreshRecentTitles() {
  cache = null;
}

export function RecentTitleOptions({ id, titles }: { id: string; titles: string[] | null }) {
  if (!titles?.length) return null;
  return (
    <datalist id={id}>
      {titles.map((t) => (
        <option key={t} value={t} />
      ))}
    </datalist>
  );
}
