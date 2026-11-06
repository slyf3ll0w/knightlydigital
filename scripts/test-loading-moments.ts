/**
 * The loading bar + router-cache purge, the two client pieces behind the
 * 30 s page cache (next.config.ts experimental.staleTimes). Plain node:
 *   npx tsx scripts/test-loading-moments.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

test("the loading bar stays hidden long enough that a fast page never flashes it", () => {
  const css = readFileSync(new URL("../app/moment.css", import.meta.url), "utf8");
  const delay = css.match(/\.wb-loadbar \{[^}]*animation:[^;]*?(\d+)ms forwards/);
  assert.ok(delay && Number(delay[1]) >= 120, "wb-loadbar needs a show delay of at least 120 ms");
  const src = readFileSync(new URL("../components/LoadingMoment.tsx", import.meta.url), "utf8");
  assert.ok(!/use client/.test(src), "the bar is CSS only: no client JS on every loading screen");
});

// Next's client router modules cannot be required in plain Node (they pull
// react-server-dom-webpack, which only resolves inside Next's bundler), so
// the internals the purge relies on are checked as source text.
test("Next still exports the router state accessor the cache purge depends on", () => {
  const instance = readFileSync(require.resolve("next/dist/client/components/app-router-instance.js"), "utf8");
  assert.ok(/function getCurrentAppRouterState\(/.test(instance), "lib/router-cache.ts: Next moved getCurrentAppRouterState — re-check the purge");
  const refresh = readFileSync(require.resolve("next/dist/client/components/router-reducer/reducers/refresh-reducer.js"), "utf8");
  assert.ok(/prefetchCache/.test(refresh), "router state no longer keeps a prefetchCache map — the purge would be a no-op");
  const navigate = readFileSync(require.resolve("next/dist/client/components/router-reducer/reducers/navigate-reducer.js"), "utf8");
  assert.ok(/getOrCreatePrefetchCacheEntry/.test(navigate), "navigations no longer read prefetchCache — the purge would be a no-op");
});

test("purgeRouterCache never throws: every internal access sits inside try/catch", () => {
  const src = readFileSync(new URL("../lib/router-cache.ts", import.meta.url), "utf8");
  assert.ok(/try \{[^]*getCurrentAppRouterState\(\)[^]*\} catch \{[^]*return false/.test(src));
});

console.log(`\n${passed} tests passed`);
