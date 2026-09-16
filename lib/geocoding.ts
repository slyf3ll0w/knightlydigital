/**
 * Forward geocoding via Mapbox — the coordinate source for the Route Manager.
 * Env-gated like Telnyx in lib/sms.ts: without MAPBOX_TOKEN every lookup is a
 * silent null, so the code ships dark and lights up when the token lands.
 *
 * Every resolved (and every failed) lookup is written to the global
 * GeocodeCache table keyed by the normalized address string, so an address is
 * paid for at most once platform-wide. Callers that own a durable row
 * (ContactAddress.lat/lng, Company.lat/lng) also persist the result there via
 * the helpers below; free-text job addresses resolve through the cache alone.
 */

import { prisma } from "@/lib/db";
import { geocodeBudgetOk } from "@/lib/mapbox-budget";
import { recordGeocodeCall } from "@/lib/usage";

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

export function geocodingEnabled(): boolean {
  return Boolean(MAPBOX_TOKEN);
}

export type LatLng = { lat: number; lng: number };

/** Join structured address parts into the one-line string we geocode. */
export function composeAddress(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  return [parts.address, parts.city, parts.state, parts.zip]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Cache key: lowercased, punctuation-light, whitespace-collapsed. */
export function normalizeAddressKey(query: string): string {
  return query.toLowerCase().replace(/[.#]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** ISO country the forward geocoder is restricted to (Mapbox `country=`). */
const GEOCODE_COUNTRY = (process.env.GEOCODE_COUNTRY ?? "us").toLowerCase();

export type GeocodeFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    match_code?: { confidence?: string };
    context?: { region?: { region_code?: string } };
  };
};

/**
 * Is this the address the user typed, or the geocoder's best guess at
 * something else? Low-confidence matches and results in another state (when
 * the company's state is known) are rejected — a wrong pin is worse than no
 * pin, because everything downstream (route order, drive times, ETAs) trusts
 * it. Pure so it can be unit-tested.
 */
export function acceptGeocodeMatch(feature: GeocodeFeature | undefined, homeState: string | null): boolean {
  if (!feature?.geometry?.coordinates) return false;
  const confidence = feature.properties?.match_code?.confidence?.toLowerCase();
  if (confidence === "low") return false;
  const region = feature.properties?.context?.region?.region_code?.toUpperCase();
  const home = homeState?.trim().toUpperCase();
  if (home && home.length === 2 && region && region !== home) return false;
  return true;
}

/**
 * Resolve a free-text address to coordinates. Cache-first; a miss calls
 * Mapbox and records the outcome either way. Returns null when the string is
 * empty, geocoding is disabled, or the address doesn't resolve — callers
 * treat null as "no pin", never as an error.
 */
export async function geocodeAddress(
  query: string,
  /** Tenant to meter the (platform-billed) lookup against; null = platform. */
  companyId?: string | null
): Promise<LatLng | null> {
  const key = normalizeAddressKey(query);
  if (!key || key.length < 4) return null;

  const cached = await prisma.geocodeCache.findUnique({ where: { query: key } });
  if (cached) return cached.status === "ok" && cached.lat != null && cached.lng != null
    ? { lat: cached.lat, lng: cached.lng }
    : null;

  if (!geocodingEnabled()) return null;
  // Free-tier kill switch — over the monthly cap this behaves exactly like a
  // missing token, and nothing is cached so the address retries next month.
  if (!(await geocodeBudgetOk())) return null;

  // Bias the lookup toward where this company works: country-restricted,
  // and near the shop when we know where that is. A bare "412 Oak St"
  // otherwise resolves to the best-known Oak St anywhere in the world and
  // quietly inserts a six-hour drive into the route walk.
  const home = companyId
    ? await prisma.company.findUnique({
        where: { id: companyId },
        select: { lat: true, lng: true, state: true },
      })
    : null;

  let result: LatLng | null = null;
  try {
    const params = new URLSearchParams({
      q: key,
      limit: "1",
      country: GEOCODE_COUNTRY,
      access_token: MAPBOX_TOKEN ?? "",
    });
    if (home?.lat != null && home?.lng != null) params.set("proximity", `${home.lng},${home.lat}`);
    const url = `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`;
    const res = await fetch(url);
    recordGeocodeCall(companyId); // a request was sent — meter it, ok or not
    if (res.ok) {
      const data = (await res.json()) as { features?: GeocodeFeature[] };
      const feature = data.features?.[0];
      const coords = feature?.geometry?.coordinates;
      if (
        coords &&
        Number.isFinite(coords[0]) &&
        Number.isFinite(coords[1]) &&
        acceptGeocodeMatch(feature, home?.state ?? null)
      ) {
        result = { lat: coords[1], lng: coords[0] };
      }
    } else {
      console.error("[geocode] mapbox lookup failed:", res.status, await res.text());
      // Rate limits / bad token are transient platform problems, not facts
      // about the address — don't negative-cache them.
      if (res.status === 401 || res.status === 403 || res.status === 429) return null;
    }
  } catch (err) {
    console.error("[geocode] mapbox lookup threw:", err);
    return null; // network blip — leave uncached so a later load retries
  }

  try {
    await prisma.geocodeCache.upsert({
      where: { query: key },
      create: { query: key, lat: result?.lat, lng: result?.lng, status: result ? "ok" : "failed" },
      update: { lat: result?.lat, lng: result?.lng, status: result ? "ok" : "failed" },
    });
  } catch {
    // Two concurrent misses can race the create; the value is identical.
  }
  return result;
}

/**
 * Geocode one saved property and stamp the row. Fire-and-forget from the
 * address create/update routes (`void geocodeContactAddress(id)`) — the
 * Route Manager also resolves lazily, so a miss here only defers the pin.
 */
export async function geocodeContactAddress(id: string): Promise<void> {
  try {
    const row = await prisma.contactAddress.findUnique({
      where: { id },
      select: {
        address: true,
        city: true,
        state: true,
        zip: true,
        contact: { select: { companyId: true } },
      },
    });
    if (!row) return;
    const hit = await geocodeAddress(composeAddress(row), row.contact.companyId);
    await prisma.contactAddress.update({
      where: { id },
      data: { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocodedAt: new Date() },
    });
  } catch (err) {
    console.error("[geocode] contact address stamp failed:", id, err);
  }
}

/** Geocode the company's shop address (route start point) and stamp it. */
export async function geocodeCompany(id: string): Promise<void> {
  try {
    const row = await prisma.company.findUnique({
      where: { id },
      select: { address: true, city: true, state: true, zip: true },
    });
    if (!row) return;
    const hit = await geocodeAddress(composeAddress(row), id);
    await prisma.company.update({
      where: { id },
      data: { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocodedAt: new Date() },
    });
  } catch (err) {
    console.error("[geocode] company stamp failed:", id, err);
  }
}
