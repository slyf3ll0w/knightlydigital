"use client";

import { useEffect, useState } from "react";

/**
 * The length chip someone picked last time ("2 hrs"), remembered on this
 * device so the next job or appointment starts from it. Browser storage can
 * be absent or throw (private windows, cleared site data), so every touch is
 * guarded and the fallback always works.
 */
export type DurationKind = "job" | "appointment";

const key = (kind: DurationKind) => `wb:duration:${kind}`;

export function readDurationPref(kind: DurationKind): number | null {
  try {
    const raw = window.localStorage.getItem(key(kind));
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeDurationPref(kind: DurationKind, minutes: number | null): void {
  try {
    if (minutes && minutes > 0) window.localStorage.setItem(key(kind), String(minutes));
    else window.localStorage.removeItem(key(kind));
  } catch {
    /* no storage — nothing to remember */
  }
}

/**
 * [minutes, set] — starts at `fallback` (same on the server and the first
 * client render, so hydration matches), then takes the remembered value
 * once mounted. `set` remembers the pick as well as applying it.
 */
export function useRememberedDuration(kind: DurationKind, fallback: number): [number | null, (m: number | null) => void] {
  const [minutes, setMinutes] = useState<number | null>(fallback);
  useEffect(() => {
    const saved = readDurationPref(kind);
    if (saved) setMinutes(saved);
  }, [kind]);
  const set = (m: number | null) => {
    setMinutes(m);
    writeDurationPref(kind, m);
  };
  return [minutes, set];
}
