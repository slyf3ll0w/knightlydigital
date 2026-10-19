/**
 * Unit tests for lib/nav-apps.ts — the Directions links into Apple Maps,
 * Google Maps and Waze.   npx tsx scripts/test-nav-apps.ts
 */
import assert from "node:assert/strict";
import { directionsHref, navAppHref, navAppsFor, navHref, navTarget, orderNavApps } from "../lib/nav-apps";

const addr = { address: "123 Main St, Allen, TX 75002" };
const pin = { lat: 33.1032, lng: -96.6706, address: "ignored when a pin exists" };

// ── which apps ──────────────────────────────────────────────────────────────
assert.deepEqual(navAppsFor(true), ["apple", "google", "waze"]);
assert.deepEqual(navAppsFor(false), ["google", "waze"], "no Apple Maps on Android / Windows");
assert.deepEqual(orderNavApps(["apple", "google", "waze"], "waze"), ["waze", "apple", "google"], "last used first");
assert.deepEqual(orderNavApps(["google", "waze"], "apple"), ["google", "waze"], "a remembered app this device lacks changes nothing");
assert.deepEqual(orderNavApps(["google", "waze"], null), ["google", "waze"]);

// ── the target ──────────────────────────────────────────────────────────────
assert.equal(navTarget(addr), "123 Main St, Allen, TX 75002");
assert.equal(navTarget(pin), "33.1032,-96.6706", "coordinates win over the address — no geocoding guess");
assert.equal(navTarget({ address: "  " }), null);
assert.equal(navTarget({}), null);

// ── directions, not a dropped pin: every link is the app's DIRECTIONS URL with no start, i.e. "from here" ──
const g = navHref("google", addr)!;
assert.ok(g.startsWith("https://www.google.com/maps/dir/?api=1&destination="), g);
assert.ok(g.includes("travelmode=driving"));
assert.ok(!g.includes("origin="), "no origin = the phone's current location");
assert.ok(!g.includes("/maps/search/"), "the old search link only dropped a pin");

const a = navHref("apple", addr)!;
assert.ok(a.startsWith("https://maps.apple.com/?daddr="), a);
assert.ok(a.includes("dirflg=d"));
assert.ok(!a.includes("saddr="), "no saddr = the phone's current location");

const w = navHref("waze", addr)!;
assert.ok(w.startsWith("https://waze.com/ul?q="), w);
assert.ok(w.includes("navigate=yes"));
assert.equal(navHref("waze", pin), "https://waze.com/ul?ll=33.1032,-96.6706&navigate=yes", "a pin is exact for Waze");

// Encoding: the address survives as one query parameter.
assert.ok(g.includes(encodeURIComponent("123 Main St, Allen, TX 75002")));

// Nothing to route to → no link at all.
assert.equal(navHref("google", {}), null);
assert.equal(navHref("apple", { lat: null, lng: null, address: "" }), null);

// The server-side default (push notification actions) is the Google directions link.
assert.equal(directionsHref(addr), g);
assert.equal(directionsHref({}), null);

// ── native shell: the app's own scheme, so no web page sits between the tap and the app ──
assert.equal(navAppHref("apple", addr, "ios"), `maps://?daddr=${encodeURIComponent(addr.address)}&dirflg=d`);
assert.ok(navAppHref("google", addr, "ios")!.startsWith("comgooglemaps://?daddr="));
assert.ok(navAppHref("google", addr, "ios")!.includes("directionsmode=driving"));
assert.ok(navAppHref("google", addr, "android")!.startsWith("google.navigation:q="), "Android goes straight to turn-by-turn");
assert.equal(navAppHref("waze", pin, "android"), "waze://?ll=33.1032,-96.6706&navigate=yes");
assert.ok(navAppHref("waze", addr, "ios")!.startsWith("waze://?q="));
assert.equal(navAppHref("google", addr, "web"), g, "on the web the https link is still the right one");
assert.equal(navAppHref("apple", {}, "ios"), null);

console.log("nav-apps: all assertions passed");
