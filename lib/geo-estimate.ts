/**
 * Pure distance helpers shared by the Route Manager (lib/routing.ts) and the
 * online-booking engine (lib/booking-engine.ts). No I/O, no Prisma — safe to
 * import from unit tests and client bundles alike.
 */

export type RoutePoint = { lat: number; lng: number };

/** Great-circle distance in km. */
export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Straight-line km → estimated drive minutes. Roads aren't straight (×1.3)
 * and service-area driving averages ~45 km/h with stops and lights. Identical
 * coordinates (same property twice) cost zero.
 */
export function estimateDriveMinutes(km: number): number {
  if (km <= 0.02) return 0;
  return Math.max(2, (km * 1.3 * 60) / 45);
}

/** Estimated drive minutes between two points (the free, no-API path). */
export function estimateDriveBetween(a: RoutePoint, b: RoutePoint): number {
  return estimateDriveMinutes(haversineKm(a, b));
}
