"use client";

/**
 * Browser-side capture stamps for a photo: when it was taken and, for a shot
 * taken just now, where. One-shot geolocation only — the same reading the
 * clock-in card takes, never continuous tracking (and nothing is read for
 * an old library pick, see shouldStampLocation).
 */
import { shouldStampLocation } from "@/lib/photos-shared";

export type CaptureStamp = {
  clientKey: string;
  takenAt: Date;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

/** The capture time a file carries: camera-roll files keep it as the modified time. */
export function takenAtOf(file: File, fallback: Date = new Date()): Date {
  const t = file.lastModified;
  if (!Number.isFinite(t) || t <= 0) return fallback;
  const d = new Date(t);
  // A clock in the future is a bad clock, not a photo from tomorrow.
  return d.getTime() > fallback.getTime() + 60_000 ? fallback : d;
}

export function readPosition(timeoutMs = 3500): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve(pos);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}

export function newClientKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stamp one file. `fromCamera` = the in-app camera button, so "now" and
 * "here" both apply; a picked file is dated from the file and located only
 * when that date is minutes old.
 */
export async function stampFor(file: File, fromCamera: boolean): Promise<CaptureStamp> {
  const now = new Date();
  const takenAt = fromCamera ? now : takenAtOf(file, now);
  const stamp: CaptureStamp = { clientKey: newClientKey(), takenAt, lat: null, lng: null, accuracy: null };
  if (fromCamera || shouldStampLocation(takenAt, now)) {
    const pos = await readPosition();
    if (pos) {
      stamp.lat = pos.coords.latitude;
      stamp.lng = pos.coords.longitude;
      stamp.accuracy = pos.coords.accuracy ?? null;
    }
  }
  return stamp;
}
