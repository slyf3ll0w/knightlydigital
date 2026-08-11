/**
 * One-time backfill: geocode every Company shop address and saved
 * ContactAddress that has no coordinates yet, seeding the GeocodeCache as it
 * goes (same normalization + endpoint as lib/geocoding.ts). Safe to re-run —
 * rows that already carry lat/lng are skipped, and cached failures aren't
 * retried against the API.
 *
 * Usage:  MAPBOX_TOKEN=pk.xxx DATABASE_URL=postgres://... node scripts/backfill-geocodes.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOKEN = process.env.MAPBOX_TOKEN;

if (!TOKEN) {
  console.error("MAPBOX_TOKEN is required.");
  process.exit(1);
}

// Spend guard: every API call is metered into CompanyUsageDaily (the same
// counter the app's monthly kill switch sums), and one run won't send more
// than MAX_API_CALLS requests (override: BACKFILL_MAX_LOOKUPS env).
const MAX_API_CALLS = Number(process.env.BACKFILL_MAX_LOOKUPS) || 5000;
let apiCalls = 0;

async function meter() {
  apiCalls++;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await prisma.companyUsageDaily.upsert({
      where: { companyId_day: { companyId: "platform", day } },
      create: { companyId: "platform", day, geocodeCalls: 1 },
      update: { geocodeCalls: { increment: 1 } },
    });
  } catch {}
}

const normalize = (q) =>
  q.toLowerCase().replace(/[.#]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);

const compose = (r) =>
  [r.address, r.city, r.state, r.zip].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function lookup(query) {
  const key = normalize(query);
  if (!key || key.length < 4) return null;

  const cached = await prisma.geocodeCache.findUnique({ where: { query: key } });
  if (cached) {
    return cached.status === "ok" && cached.lat != null ? { lat: cached.lat, lng: cached.lng } : null;
  }

  if (apiCalls >= MAX_API_CALLS) {
    console.error(`Reached the per-run lookup limit (${MAX_API_CALLS}) — re-run to continue.`);
    process.exit(0);
  }

  await sleep(150); // stay well under Mapbox's rate limit
  let result = null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(key)}&limit=1&access_token=${TOKEN}`
    );
    await meter();
    if (!res.ok) {
      console.error(`  ! mapbox ${res.status} for "${key}"`);
      if (res.status === 401 || res.status === 403) process.exit(1); // bad token — stop
      return null; // transient: leave uncached
    }
    const data = await res.json();
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
      result = { lat: coords[1], lng: coords[0] };
    }
  } catch (err) {
    console.error(`  ! lookup threw for "${key}":`, err.message);
    return null;
  }

  await prisma.geocodeCache.upsert({
    where: { query: key },
    create: { query: key, lat: result?.lat, lng: result?.lng, status: result ? "ok" : "failed" },
    update: { lat: result?.lat, lng: result?.lng, status: result ? "ok" : "failed" },
  });
  return result;
}

let hits = 0;
let misses = 0;

const companies = await prisma.company.findMany({
  where: { lat: null, address: { not: null } },
  select: { id: true, name: true, address: true, city: true, state: true, zip: true },
});
console.log(`Companies to geocode: ${companies.length}`);
for (const c of companies) {
  const hit = await lookup(compose(c));
  await prisma.company.update({
    where: { id: c.id },
    data: { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocodedAt: new Date() },
  });
  hit ? hits++ : misses++;
  console.log(`  ${hit ? "✓" : "✗"} ${c.name}`);
}

const addresses = await prisma.contactAddress.findMany({
  where: { lat: null },
  select: { id: true, address: true, city: true, state: true, zip: true },
});
console.log(`Saved properties to geocode: ${addresses.length}`);
for (const a of addresses) {
  const hit = await lookup(compose(a));
  await prisma.contactAddress.update({
    where: { id: a.id },
    data: { lat: hit?.lat ?? null, lng: hit?.lng ?? null, geocodedAt: new Date() },
  });
  hit ? hits++ : misses++;
}

console.log(`Done. ${hits} resolved, ${misses} unresolved.`);
await prisma.$disconnect();
