// Shared helpers for clock-in/out time entries (see TimeEntry in schema.prisma).

/** "2h 15m" / "45m" / "3h" — used in activity notes, timesheets, and cards. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Milliseconds an entry spans; open entries run until `now`. */
export function entryMs(
  entry: { startedAt: Date | string; endedAt: Date | string | null },
  now: Date = new Date()
): number {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime();
  return Math.max(0, end - start);
}

/**
 * Accept the client's tap-time so queued/retried clocks stay honest, but
 * never trust it blindly: cap at 24h in the past and 2 minutes of clock skew
 * into the future. Anything unparseable falls back to the server clock.
 */
export function resolveOccurredAt(raw: unknown): Date {
  const now = Date.now();
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    if (!Number.isNaN(t) && t >= now - 24 * 3600_000 && t <= now + 2 * 60_000) {
      return new Date(t);
    }
  }
  return new Date(now);
}

export type GpsStamp = { lat: number; lng: number; accuracy: number | null };

/** Validate a GPS stamp from the client; null when absent or out of range. */
export function sanitizeGps(body: {
  lat?: unknown;
  lng?: unknown;
  accuracy?: unknown;
}): GpsStamp | null {
  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lng = typeof body.lng === "number" ? body.lng : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const accuracy =
    typeof body.accuracy === "number" && Number.isFinite(body.accuracy) && body.accuracy >= 0
      ? Math.round(body.accuracy)
      : null;
  return { lat, lng, accuracy };
}

/** Google Maps pin link for a stamp (works on web, iOS, and Android). */
export function mapsHref(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
