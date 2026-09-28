/**
 * Unit tests for the small pure guards added in the ops-flow review
 * (2026-09-15, Batch E): quote expiry by company day, geocode match
 * acceptance, serialization-abort retry.
 *   DATABASE_URL=postgresql://u:p@localhost:5432/unused npx tsx scripts/test-ops-guards.ts
 * (lib/geocoding pulls in the Prisma client — never queried here.)
 */
import assert from "node:assert/strict";
import { quoteExpired } from "../lib/quote-expiry";
import { acceptGeocodeMatch, addressNamesPlace, geocodeCacheKey, normalizeAddressKey } from "../lib/geocoding";
import { withSerializationRetry } from "../lib/booking-submit";
import { Prisma } from "@prisma/client";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`  ok — ${name}`);
  });
}

const TZ = "America/Chicago";
// Editor stores "valid until 2026-07-30" as browser-local noon → for a
// Chicago user that's 17:00Z.
const validUntil = new Date("2026-07-30T17:00:00Z");

async function main() {
  await test("a quote is still valid all day on its valid-until date", () => {
    assert.equal(quoteExpired(validUntil, TZ, new Date("2026-07-30T17:01:00Z")), false); // 12:01pm
    assert.equal(quoteExpired(validUntil, TZ, new Date("2026-07-31T04:59:00Z")), false); // 11:59pm Chicago
  });

  await test("…and expired once that day has ended in the company's timezone", () => {
    assert.equal(quoteExpired(validUntil, TZ, new Date("2026-07-31T05:00:00Z")), true); // midnight Chicago
    assert.equal(quoteExpired(null, TZ), false);
  });

  await test("geocode: low-confidence and out-of-state matches are rejected", () => {
    const tx = { geometry: { coordinates: [-96.8, 32.8] as [number, number] }, properties: { match_code: { confidence: "high" }, context: { region: { region_code: "TX" } } } };
    assert.equal(acceptGeocodeMatch(tx, "TX"), true);
    assert.equal(acceptGeocodeMatch(tx, "tx"), true);
    assert.equal(acceptGeocodeMatch(tx, null), true); // unknown home state → can't judge
    assert.equal(acceptGeocodeMatch({ ...tx, properties: { ...tx.properties, context: { region: { region_code: "OK" } } } }, "TX"), false);
    assert.equal(acceptGeocodeMatch({ ...tx, properties: { ...tx.properties, match_code: { confidence: "low" } } }, "TX"), false);
    assert.equal(acceptGeocodeMatch({ geometry: { coordinates: [-96.8, 32.8] } }, "TX"), true); // no metadata → accept
    assert.equal(acceptGeocodeMatch(undefined, "TX"), false);
    // A query that named its own state is trusted across the border (Texarkana, Kansas City…)
    const ok = { ...tx, properties: { ...tx.properties, context: { region: { region_code: "OK" } } } };
    assert.equal(acceptGeocodeMatch(ok, "TX", true), true);
    assert.equal(acceptGeocodeMatch({ ...ok, properties: { ...ok.properties, match_code: { confidence: "low" } } }, "TX", true), false);
  });

  await test("geocode cache: complete addresses share one key; bare ones are scoped to the company", () => {
    assert.equal(addressNamesPlace(normalizeAddressKey("6000 W Plano Pkwy, Plano, TX 75093")), true);
    assert.equal(addressNamesPlace(normalizeAddressKey("100 Main St, Texarkana, AR")), true);
    assert.equal(addressNamesPlace(normalizeAddressKey("412 Oak St")), false);
    assert.equal(addressNamesPlace(normalizeAddressKey("412 Oak St, Plano")), false);
    const tx = { state: "TX", lat: 33.0, lng: -96.7 };
    const ok = { state: "OK", lat: 35.5, lng: -97.5 };
    const full = normalizeAddressKey("412 Oak St, Plano, TX 75074");
    assert.equal(geocodeCacheKey(full, tx), full);
    assert.equal(geocodeCacheKey(full, ok), full);
    const bare = normalizeAddressKey("412 Oak St");
    assert.notEqual(geocodeCacheKey(bare, tx), geocodeCacheKey(bare, ok));
    assert.equal(geocodeCacheKey(bare, tx), "412 oak st |near tx");
    assert.equal(geocodeCacheKey(bare, { state: null, lat: 33.04, lng: -96.71 }), "412 oak st |near 33.0,-96.7");
    assert.equal(geocodeCacheKey(bare, null), bare);
  });

  await test("serialization aborts (P2034) retry; anything else surfaces at once", async () => {
    let calls = 0;
    const p2034 = () =>
      new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "5" });
    const out = await withSerializationRetry(async () => {
      calls++;
      if (calls < 3) throw p2034();
      return "booked";
    });
    assert.equal(out, "booked");
    assert.equal(calls, 3);

    calls = 0;
    await assert.rejects(
      withSerializationRetry(async () => {
        calls++;
        throw p2034();
      }, 2)
    );
    assert.equal(calls, 2);

    calls = 0;
    await assert.rejects(
      withSerializationRetry(async () => {
        calls++;
        throw new Error("slot taken");
      }),
      /slot taken/
    );
    assert.equal(calls, 1);
  });

  console.log(`\n${passed} ops-guard tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
