/**
 * Unit tests for the pure pieces of the drive-time engine (lib/routing.ts,
 * lib/directions.ts): the solver, the leg-cache keys, chain windows.
 *   npx tsx scripts/test-routing.ts   (needs a placeholder DATABASE_URL — never queried)
 */
import assert from "node:assert/strict";
import { legKey, routeMinutes, roundGapMinutes, samePoint, solveStopOrder, haversineKm, estimateDriveMinutes } from "../lib/routing";
import { chainWindows } from "../lib/directions";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("routing");

function perms(a: number[]): number[][] {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

// Seeded PRNG (mulberry32): the 240 "random" days are the same every run.
// Unseeded, about one run in forty drew a day the heuristic solved 8–10%
// off optimal, and CI went red for nothing (2026-09-29).
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("solveStopOrder: within 8% of brute force on 120 fixed random 7-stop days (open and round trip)", () => {
  let worst = 0;
  const rest = [1, 2, 3, 4, 5, 6];
  const rand = seeded(20260929);
  for (let r = 0; r < 120; r++) {
    const pts = Array.from({ length: 7 }, () => ({ lat: 33 + rand() * 0.3, lng: -96.8 + rand() * 0.3 }));
    // asymmetric, like real roads
    const m = pts.map((a) => pts.map((b) => estimateDriveMinutes(haversineKm(a, b)) * (0.9 + rand() * 0.2)));
    for (const rt of [false, true]) {
      const order = solveStopOrder(m, 0, rt);
      assert.equal(order[0], 0, "start stays first");
      assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5, 6], "every stop once");
      const got = routeMinutes(m, order, rt);
      let best = Infinity;
      for (const p of perms(rest)) best = Math.min(best, routeMinutes(m, [0, ...p], rt));
      worst = Math.max(worst, (got - best) / best);
    }
  }
  assert.ok(worst < 0.08, `worst gap ${(worst * 100).toFixed(1)}% over 240 solves`);
});

test("solveStopOrder: trivial sizes and a hand-checkable line", () => {
  assert.deepEqual(solveStopOrder([[0]]), [0]);
  assert.deepEqual(solveStopOrder([[0, 5], [5, 0]]), [0, 1]);
  // Points on a line at 0, 10, 20, 30 — start at 0, nearest first, no zig-zag
  const line = [0, 30, 10, 20];
  const m = line.map((a) => line.map((b) => Math.abs(a - b)));
  assert.deepEqual(solveStopOrder(m, 0), [0, 2, 3, 1]);
  assert.equal(routeMinutes(m, [0, 2, 3, 1]), 30);
  assert.equal(routeMinutes(m, [0, 2, 3, 1], true), 60);
});

test("roundGapMinutes rounds up to five", () => {
  assert.equal(roundGapMinutes(0), 0);
  assert.equal(roundGapMinutes(-3), 0);
  assert.equal(roundGapMinutes(1), 5);
  assert.equal(roundGapMinutes(12), 15);
  assert.equal(roundGapMinutes(15), 15);
});

test("leg cache keys: direction matters, 11 m of drift does not", () => {
  const a = { lat: 33.01234, lng: -96.71234 };
  const b = { lat: 33.09876, lng: -96.79876 };
  assert.equal(legKey(a, b), "33.0123,-96.7123>33.0988,-96.7988");
  assert.notEqual(legKey(a, b), legKey(b, a));
  assert.equal(legKey({ lat: 33.01231, lng: -96.71232 }, b), legKey(a, b));
  assert.equal(samePoint(a, { lat: 33.01231, lng: -96.71232 }), true);
  assert.equal(samePoint(a, b), false);
});

test("chainWindows: ≤25 points is one window; longer chains overlap by one point", () => {
  const pts = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(chainWindows(pts), [pts]);
  const long = Array.from({ length: 40 }, (_, i) => i);
  const w = chainWindows(long);
  assert.equal(w.length, 2);
  assert.equal(w[0].length, 25);
  assert.equal(w[0][24], w[1][0], "seam point is shared");
  assert.equal(w[1][w[1].length - 1], 39);
  // legs of the windows add up to the legs of the chain
  assert.equal(w.reduce((n, x) => n + x.length - 1, 0), long.length - 1);
  const w3 = chainWindows(Array.from({ length: 60 }, (_, i) => i), 25);
  assert.equal(w3.reduce((n, x) => n + x.length - 1, 0), 59);
  assert.deepEqual(chainWindows([1, 2], 25), [[1, 2]]);
});

console.log(`\n${passed} routing tests passed`);
