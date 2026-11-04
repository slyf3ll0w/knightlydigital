/**
 * The loading moment + router-cache purge, the two client pieces behind the
 * 30 s page cache (next.config.ts experimental.staleTimes). Plain node:
 *   npx tsx scripts/test-loading-moments.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { MOMENTS, MOMENT_ICONS, MOMENT_MAX_CHARS, pickMoment } from "../lib/loading-moments";

const require = createRequire(import.meta.url);
let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("every moment's icon is a real lucide-react export (the pill would render nothing otherwise)", () => {
  const lucide = require("lucide-react") as Record<string, unknown>;
  for (const name of MOMENT_ICONS) assert.equal(typeof lucide[name], "object", `lucide-react has no ${name}`);
  for (const m of MOMENTS) assert.ok((MOMENT_ICONS as readonly string[]).includes(m.icon), `${m.text} uses unlisted icon ${m.icon}`);
});

test("lines are short, unique, and read like a tech, not a computer", () => {
  const seen = new Set<string>();
  for (const m of MOMENTS) {
    assert.ok(m.text.length <= MOMENT_MAX_CHARS, `"${m.text}" is ${m.text.length} chars (max ${MOMENT_MAX_CHARS})`);
    assert.ok(!/[.!…]$/.test(m.text), `"${m.text}" ends with punctuation`);
    assert.ok(!/\bloading\b|please wait/i.test(m.text), `"${m.text}" is computer-speak`);
    assert.ok(!seen.has(m.text), `"${m.text}" appears twice`);
    seen.add(m.text);
  }
  assert.ok(MOMENTS.length >= 40, "enough variety that a day of taps rarely repeats");
});

test("the LoadingMoment icon map covers every icon the list can name", () => {
  const src = readFileSync(new URL("../components/LoadingMoment.tsx", import.meta.url), "utf8");
  const mapBlock = src.slice(src.indexOf("const ICONS"), src.indexOf("};", src.indexOf("const ICONS")));
  for (const name of MOMENT_ICONS) assert.ok(mapBlock.split(/[\s,]+/).includes(name), `ICONS map lacks ${name}`);
});

test("pickMoment never repeats the previous pick, even when random says so", () => {
  const first = pickMoment(() => 0.5);
  const second = pickMoment(() => 0.5);
  assert.notEqual(first.text, second.text);
  const third = pickMoment(() => 0.999999);
  assert.ok(third.text);
  const outOfRange = pickMoment(() => 1); // floor(1 * n) % n wraps to 0 instead of undefined
  assert.ok(outOfRange.text);
});

test("Next still exports the router state accessor the cache purge depends on", () => {
  const mod = require("next/dist/client/components/app-router-instance") as Record<string, unknown>;
  assert.equal(typeof mod.getCurrentAppRouterState, "function", "lib/router-cache.ts: Next moved getCurrentAppRouterState — re-check the purge");
  const reducer = readFileSync(require.resolve("next/dist/client/components/router-reducer/reducers/navigate-reducer.js"), "utf8");
  assert.ok(/getOrCreatePrefetchCacheEntry/.test(reducer), "navigations no longer read prefetchCache — the purge would be a no-op");
});

test("purgeRouterCache is a no-op outside the browser (no router mounted) and never throws", async () => {
  const { purgeRouterCache } = await import("../lib/router-cache");
  assert.equal(purgeRouterCache(), false);
});

console.log(`\n${passed} tests passed`);
