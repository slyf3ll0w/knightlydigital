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
 *
 * Two rules keep the shared cache honest across tenants (2026-09-28):
 *  - A COMPLETE address (one that names a state or a ZIP) means what it says
 *    wherever it was typed, so its answer is shared platform-wide and is
 *    accepted even when the pin lands in another state than the shop — a
 *    Texas company's customer in Texarkana, AR is a real customer.
 *  - A BARE address ("412 Oak St") only resolves relative to the company
 *    that typed it (proximity bias + the home-state check), so its cache
 *    entry is scoped to that company's state — one tenant's guess can never
 *    become another tenant's pin.
 * A failed lookup is retried after FAILED_RETRY_DAYS: geocoders improve,
 * and new construction gets an address eventually.
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

/**
 * Does the (normalized) query name where it is — a ZIP, or a state after a
 * comma ("…, tx" / "…, tx 75093")? Such an address is unambiguous on its
 * own; a bare street needs the company's neighbourhood to mean anything.
 * Pure (unit-tested).
 */
export function addressNamesPlace(key: string): boolean {
  if (/\b\d{5}(-\d{4})?\b/.test(key)) return true;
  return /,\s*[a-z]{2}(\s*,)?\s*$/.test(key) || /,\s*[a-z]{2}\s+\d{5}/.test(key);
}

function hasWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * A job's or appointment's address LINE, completed with the client's city,
 * state and ZIP when the line doesn't name a place of its own. A job created
 * from a client used to copy just the street ("4405 Stonebridge Dr") — the
 * geocoder then found a Stonebridge Dr in another state. Parts the line
 * already contains aren't repeated; a line that names a state or ZIP is
 * returned as typed. Pure (unit-tested).
 */
export function completeAddress(
  line: string | null | undefined,
  parts: { city?: string | null; state?: string | null; zip?: string | null } | null | undefined
): string | null {
  const l = (line ?? "").trim();
  if (!l) return null;
  if (addressNamesPlace(normalizeAddressKey(l))) return l;
  const extra = [parts?.city, parts?.state, parts?.zip]
    .map((p) => (p ?? "").trim())
    .filter((p) => p && !hasWord(l, p));
  return extra.length ? `${l}, ${extra.join(", ")}` : l;
}

/**
 * The GeocodeCache row key for a query from this company: shared when the
 * address is complete, scoped to the company's state (or its shop's
 * rough position) when it is bare. Pure (unit-tested).
 */
export function geocodeCacheKey(key: string, home: { state?: string | null; lat?: number | null; lng?: number | null } | null): string {
  if (addressNamesPlace(key)) return key;
  const state = home?.state?.trim().toLowerCase();
  if (state) return `${key} |near ${state}`;
  if (home?.lat != null && home?.lng != null) return `${key} |near ${home.lat.toFixed(1)},${home.lng.toFixed(1)}`;
  return key;
}

/** ISO country the forward geocoder is restricted to (Mapbox `country=`). */
const GEOCODE_COUNTRY = (process.env.GEOCODE_COUNTRY ?? "us").toLowerCase();
const FAILED_RETRY_DAYS = 30;

type CompanyHome = { lat: number | null; lng: number | null; state: string | null };
// A route day geocodes every stop through here; the shop's position is the
// same for all of them, so it is read once a minute per tenant, not once
// per stop.
const homeCache = new Map<string, { at: number; home: CompanyHome | null }>();
const HOME_CACHE_MS = 60_000;

async function companyHome(companyId: string): Promise<CompanyHome | null> {
  const hit = homeCache.get(companyId);
  if (hit && Date.now() - hit.at < HOME_CACHE_MS) return hit.home;
  const home = await prisma.company.findUnique({
    where: { id: companyId },
    select: { lat: true, lng: true, state: true },
  });
  if (homeCache.size > 500) homeCache.clear();
  homeCache.set(companyId, { at: Date.now(), home });
  return home;
}

export type GeocodeFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    match_code?: { confidence?: string };
    context?: { region?: { region_code?: string } };
  };
};

/**
 * Is this the address the user typed, or the geocoder's best guess at
 * something else? Low-confidence matches are rejected outright. A result in
 * another state than the company's is rejected only for a BARE query (the
 * geocoder guessed the place); a query that named its own state or ZIP is
 * trusted as typed — a wrong pin is worse than no pin, but so is dropping a
 * real cross-border customer. Pure so it can be unit-tested.
 */
export function acceptGeocodeMatch(feature: GeocodeFeature | undefined, homeState: string | null, namesPlace = false): boolean {
  if (!feature?.geometry?.coordinates) return false;
  const confidence = feature.properties?.match_code?.confidence?.toLowerCase();
  if (confidence === "low") return false;
  if (namesPlace) return true;
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
  const namesPlace = addressNamesPlace(key);

  // Bias the lookup toward where this company works: country-restricted,
  // and near the shop when we know where that is. A bare "412 Oak St"
  // otherwise resolves to the best-known Oak St anywhere in the world and
  // quietly inserts a six-hour drive into the route walk.
  const home = companyId ? await companyHome(companyId) : null;
  const cacheKey = geocodeCacheKey(key, home);

  const cached = await prisma.geocodeCache.findUnique({ where: { query: cacheKey } });
  if (cached) {
    if (cached.status === "ok" && cached.lat != null && cached.lng != null) return { lat: cached.lat, lng: cached.lng };
    // A failure is not forever — retry a stale one
    if (Date.now() - cached.updatedAt.getTime() < FAILED_RETRY_DAYS * 86400_000) return null;
  }

  if (!geocodingEnabled()) return null;
  // Free-tier kill switch — over the monthly cap this behaves exactly like a
  // missing token, and nothing is cached so the address retries next month.
  if (!(await geocodeBudgetOk())) return null;

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
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    recordGeocodeCall(companyId); // a request was sent — meter it, ok or not
    if (res.ok) {
      const data = (await res.json()) as { features?: GeocodeFeature[] };
      const feature = data.features?.[0];
      const coords = feature?.geometry?.coordinates;
      if (
        coords &&
        Number.isFinite(coords[0]) &&
        Number.isFinite(coords[1]) &&
        acceptGeocodeMatch(feature, home?.state ?? null, namesPlace)
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
      where: { query: cacheKey },
      create: { query: cacheKey, lat: result?.lat, lng: result?.lng, status: result ? "ok" : "failed" },
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

/* ───────────────────────── Address suggestions ───────────────────────── */

/** The four fields the texting-registration form files. */
export type AddressSuggestion = { label: string; street: string; city: string; state: string; postalCode: string };

/** The parts of a Mapbox v6 feature the suggestion needs. */
export type SuggestFeature = {
  properties?: {
    name?: string;
    full_address?: string;
    context?: {
      address?: { name?: string };
      place?: { name?: string };
      region?: { region_code?: string };
      postcode?: { name?: string };
    };
  };
};

/** One suggestion from one feature, or null when it isn't a complete street address. Pure. */
export function suggestionFromFeature(f: SuggestFeature): AddressSuggestion | null {
  const p = f.properties;
  const ctx = p?.context;
  const street = (ctx?.address?.name ?? p?.name ?? "").trim();
  const city = (ctx?.place?.name ?? "").trim();
  const state = (ctx?.region?.region_code ?? "").trim().toUpperCase();
  const postalCode = (ctx?.postcode?.name ?? "").trim().slice(0, 5);
  if (!street || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}$/.test(postalCode)) return null;
  return { label: p?.full_address ?? `${street}, ${city}, ${state} ${postalCode}`, street, city, state, postalCode };
}

/**
 * Up to five USPS-form street addresses matching a partial one, biased
 * toward the company's location. Metered and budget-capped like every
 * geocode; empty when the token is missing or the month's cap is spent.
 */
export async function suggestAddresses(query: string, companyId: string | null): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 4 || !geocodingEnabled() || !(await geocodeBudgetOk())) return [];
  const home = companyId
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { lat: true, lng: true } })
    : null;
  const params = new URLSearchParams({
    q,
    autocomplete: "true",
    types: "address",
    limit: "5",
    country: GEOCODE_COUNTRY,
    access_token: MAPBOX_TOKEN ?? "",
  });
  if (home?.lat != null && home?.lng != null) params.set("proximity", `${home.lng},${home.lat}`);
  try {
    const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, {
      signal: AbortSignal.timeout(5_000),
    });
    recordGeocodeCall(companyId);
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: SuggestFeature[] };
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const f of data.features ?? []) {
      const s = suggestionFromFeature(f);
      if (s && !seen.has(s.label)) {
        seen.add(s.label);
        out.push(s);
      }
    }
    return out;
  } catch (err) {
    console.error("[geocode] suggest failed:", err);
    return [];
  }
}
