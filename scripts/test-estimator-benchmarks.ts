/**
 * Trade baselines, the market merge and the builder's self-check
 * (lib/estimator-benchmarks.ts, lib/estimator-market.ts, isColdBuild).
 *   npx tsx scripts/test-estimator-benchmarks.ts
 * Needs a placeholder DATABASE_URL (the builder module imports Prisma; never queried).
 */
import assert from "node:assert/strict";
import { minimumAsRate } from "../lib/estimator-build";
import { BENCHMARKS, benchmarkFor, driftCheck, marketCheck, minimumCheck, regionFactor, typicalSample } from "../lib/estimator-benchmarks";
import { cleanRates, cleanTypical, marketRules, marketText, mergeMarket } from "../lib/estimator-market";
import { PLAYBOOK } from "../lib/estimator-playbook";

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

test("every playbook trade has a baseline, and no baseline is orphaned", () => {
  const keys = PLAYBOOK.map((p) => p.key).sort();
  assert.deepEqual(Object.keys(BENCHMARKS).sort(), keys);
});

test("every baseline is internally sane", () => {
  for (const [key, b] of Object.entries(BENCHMARKS)) {
    assert.ok(b.rates.length >= 2, `${key}: at least two rates`);
    assert.ok(b.labor.length > 20, `${key}: labor line`);
    for (const x of b.rates) {
      assert.ok(x.low > 0 && x.high >= x.low, `${key}: ${x.what} range`);
      assert.ok(x.high <= x.low * 4, `${key}: ${x.what} range is too wide to be useful`);
      assert.ok(x.what && x.unit, `${key}: rate needs a name and unit`);
    }
    const t = b.typical;
    assert.ok(t.job.length > 15 && t.low > 0 && t.high >= t.low && t.high <= t.low * 2.5, `${key}: typical job range`);
    assert.ok(t.hoursLow > 0 && t.hoursHigh >= t.hoursLow, `${key}: typical hours`);
    // nobody's typical job bills under $25 or over $600 per person-hour
    const perHourLow = t.low / t.hoursHigh, perHourHigh = t.high / t.hoursLow;
    assert.ok(perHourLow >= 25 && perHourHigh <= 1300, `${key}: $/person-hour ${perHourLow.toFixed(0)}–${perHourHigh.toFixed(0)}`);
  }
});

test("region factor reads abbreviations and names, and defaults to 1", () => {
  assert.equal(regionFactor("CA"), 1.2);
  assert.equal(regionFactor("california"), 1.2);
  assert.equal(regionFactor(" tx "), 1);
  assert.equal(regionFactor("Mississippi"), 0.9);
  assert.equal(regionFactor("co"), 1.1);
  assert.equal(regionFactor(null), 1);
  assert.equal(regionFactor("Narnia"), 1);
});

test("benchmarkFor scales money, never hours", () => {
  const base = benchmarkFor("fencing", "TX")!;
  const ca = benchmarkFor("FENCING", "CA")!;
  assert.equal(base, BENCHMARKS.fencing);
  assert.ok(ca.typical.low > base.typical.low && ca.rates[0].high > base.rates[0].high);
  assert.equal(ca.typical.hoursHigh, base.typical.hoursHigh);
  assert.equal(benchmarkFor("underwater basket weaving"), null);
  assert.equal(benchmarkFor(null), null);
});

test("typicalSample: by label, else the middle one", () => {
  const s = [{ label: "Small job", subtotal: 1 }, { label: "Typical job", subtotal: 2 }, { label: "Large job", subtotal: 3 }];
  assert.equal(typicalSample(s)!.subtotal, 2);
  assert.equal(typicalSample([{ label: "A", subtotal: 1 }, { label: "B", subtotal: 2 }, { label: "C", subtotal: 3 }])!.label, "B");
  assert.equal(typicalSample([{ label: "A", subtotal: null }]), null);
});

test("marketCheck: the fence tool from ticket #0fe8f7 is caught on hours, a sane one passes", () => {
  const typical = BENCHMARKS.fencing.typical; // 150 ft wood privacy + walk gate: $4,500–8,500, 20–36 person-hours
  assert.deepEqual(marketCheck([{ label: "Typical job", subtotal: 6400, hours: 28 }], typical), []);
  // edges of the range and a bit beyond still pass — a business may sit there
  assert.deepEqual(marketCheck([{ label: "Typical job", subtotal: 9800, hours: 40 }], typical), []);
  const high = marketCheck([{ label: "Typical job", subtotal: 21000 }], typical, "Allen, TX");
  assert.equal(high.length, 1);
  assert.match(high[0], /too HIGH/);
  assert.match(high[0], /around Allen, TX/);
  assert.match(marketCheck([{ label: "Typical job", subtotal: 1500 }], typical)[0], /too LOW/);
  // price fine, hours triple
  const slow = marketCheck([{ label: "Typical job", subtotal: 7000, hours: 96 }], typical);
  assert.equal(slow.length, 1);
  assert.match(slow[0], /hours/);
  assert.match(marketCheck([{ label: "Typical job", subtotal: 7000, hours: 4 }], typical)[0], /PERSON-hours/);
  // nothing to compare against
  assert.deepEqual(marketCheck([{ label: "Typical job", subtotal: 99999 }], null), []);
  assert.deepEqual(marketCheck([], typical), []);
});

test("cleanRates drops rows that aren't a range", () => {
  const rows = cleanRates([
    { what: "Wood privacy, 6 ft", unit: "ft", low: 30, high: 48 },
    { what: "Backwards", unit: "ft", low: 50, high: 20 },
    { what: "Absurd spread", unit: "ft", low: 1, high: 500 },
    { what: "", unit: "ft", low: 1, high: 2 },
    { what: "Strings", unit: "ft", low: "30", high: "40" },
    null,
  ]);
  assert.deepEqual(rows, [{ what: "Wood privacy, 6 ft", unit: "ft", low: 30, high: 48 }]);
  assert.deepEqual(cleanRates("nope"), []);
});

test("cleanTypical trusts a search only near the baseline", () => {
  const base = BENCHMARKS.fencing.typical;
  assert.ok(cleanTypical({ job: "150 ft cedar privacy with a gate", low: 5200, high: 7800, hoursLow: 22, hoursHigh: 30 }, base));
  assert.equal(cleanTypical({ job: "150 ft cedar privacy with a gate", low: 40000, high: 60000 }, base), null);
  assert.equal(cleanTypical({ job: "150 ft cedar privacy with a gate", low: 300, high: 600 }, base), null);
  // wild hours fall back to the baseline's, the price is kept
  const t = cleanTypical({ job: "150 ft cedar privacy with a gate", low: 5200, high: 7800, hoursLow: 400, hoursHigh: 900 }, base)!;
  assert.equal(t.hoursHigh, base.hoursHigh);
  assert.equal(t.low, 5200);
  assert.equal(cleanTypical({ job: "x", low: 1 }, null), null);
});

test("mergeMarket: search first, baseline fills in, typical keeps the baseline's wording", () => {
  const baseline = benchmarkFor("fencing", "TX");
  const m = mergeMarket("Allen, TX", { rates: [{ what: "Wood privacy fence, 6 ft", unit: "ft", low: 32, high: 46 }, { what: "Cedar upgrade", unit: "ft", low: 6, high: 12 }], typical: { job: "whatever the model called it", low: 5000, high: 7500, hoursLow: 20, hoursHigh: 30 }, sources: ["https://example.com/fence-costs", "not a url"] }, baseline)!;
  assert.equal(m.searched, true);
  assert.equal(m.rates[0].low, 32); // the searched row replaced the same-named baseline row
  assert.equal(m.rates.filter((x) => x.what === "Wood privacy fence, 6 ft").length, 1);
  assert.ok(m.rates.some((x) => x.what === "Walk gate, wood or vinyl"));
  assert.equal(m.typical!.job, baseline!.typical.job);
  assert.equal(m.typical!.low, 5000);
  assert.deepEqual(m.sources, ["https://example.com/fence-costs"]);

  const alone = mergeMarket("", null, baseline)!;
  assert.equal(alone.searched, false);
  assert.equal(alone.typical, baseline!.typical);
  assert.equal(mergeMarket("", null, null), null);
  assert.equal(mergeMarket("", { rates: [] }, null), null);

  const text = marketText(m);
  assert.match(text, /MARKET NUMBERS — Allen, TX/);
  assert.match(text, /NOT this business's prices/);
  assert.match(text, /\$32–\$46 per ft/);
  assert.match(marketRules(m), /market estimate for Allen, TX/);
  assert.doesNotMatch(marketRules(alone), /market estimate for/);
});

test("minimumCheck: the $600 fence minimum from the ticket reads low; $1,000 and the owner-free case are handled", () => {
  const fence = benchmarkFor("fencing", "TX")!;
  assert.ok(fence.minimum && fence.minimum.low >= 900);
  assert.match(minimumCheck(600, fence.minimum, "Dallas, TX")[0], /\$600.*around Dallas, TX.*LOW/);
  assert.deepEqual(minimumCheck(1000, fence.minimum), []);
  assert.match(minimumCheck(undefined, fence.minimum)[0], /no minimum job charge/);
  assert.deepEqual(minimumCheck(100, null), []);
  // gates are priced by what they match, and the styles the ticket asked for are on the sheet
  const whats = fence.rates.map((x) => x.what).join(" | ");
  for (const want of ["Walk gate, wood or vinyl", "Walk gate, chain link", "Single drive gate", "Ornamental", "Ranch rail", "Pipe rail", "Board-on-board", "Stain and seal", "Corner or end post", "chain link removal"]) assert.ok(whats.toLowerCase().includes(want.toLowerCase()), want);
  assert.match(marketText(mergeMarket("Dallas, TX", null, fence)!), /Minimum job charge businesses in this trade set: \$900–\$1,500/);
});

test("driftCheck: a change that moves the typical job is caught; one that holds it is not", () => {
  // the real case: cedar '$30 at 4 ft' relabelled '6 ft tall' without re-basing → the 150 ft typical job fell from $6,725 to $4,925
  const before = [{ label: "Small job", subtotal: 900 }, { label: "Typical job", subtotal: 6725 }, { label: "Large job", subtotal: 22475 }];
  const dropped = driftCheck(before, [{ label: "Tiny job: one gate", subtotal: 900 }, { label: "Small job", subtotal: 900 }, { label: "Typical job", subtotal: 4925 }]);
  assert.match(dropped[0], /\$6,725 before this change and \$4,925 after \(−27%\)/);
  assert.match(driftCheck(before, [{ label: "Typical job", subtotal: 9000 }])[0], /\+34%/);
  assert.deepEqual(driftCheck(before, [{ label: "Typical job", subtotal: 6557 }]), []);
  assert.deepEqual(driftCheck([], [{ label: "Typical job", subtotal: 6557 }]), []);
  assert.deepEqual(driftCheck(before, [{ label: "Typical job", subtotal: null }]), []);
});

async function builderTests() {
  process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5432/unused";
  const { isColdBuild } = await import("../lib/estimator-build");
  test("isColdBuild: only when nothing anywhere names a rate", () => {
    const base = { ratesOnFile: 0, prompt: "make me a fencing estimate tool", hasImage: false, answers: [] };
    assert.equal(isColdBuild(base), true);
    assert.equal(isColdBuild({ ...base, ratesOnFile: 3 }), false);
    assert.equal(isColdBuild({ ...base, hasImage: true }), false);
    assert.equal(isColdBuild({ ...base, prompt: "fence tool, cedar is $42 a foot" }), false);
    assert.equal(isColdBuild({ ...base, prompt: "I charge 85 per hour plus parts" }), false);
    assert.equal(isColdBuild({ ...base, prompt: "fences, 6 ft and 8 ft tall, 2 gate types" }), true);
    assert.equal(isColdBuild({ ...base, answers: [{ question: "What do you charge per foot?", answer: "$38 per ft for wood privacy" }] }), false);
    assert.equal(isColdBuild({ ...base, answers: [{ question: "What do you charge per foot?", answer: "" }] }), true);
  });
}

builderTests().then(() => console.log(`\n${n} passed`));

test("minimumAsRate: a minimum hidden on the rate card is sent back; a real minimumTotal or a per-stump minimum is fine", () => {
  const rate = (label: string, value: number) => ({ id: "r", label, value, unit: "flat", kind: "price" as const, source: "owner" as const });
  assert.match(minimumAsRate({ rates: [rate("Minimum job charge", 1200)] })[0], /"minimumTotal": 1200/);
  assert.deepEqual(minimumAsRate({ rates: [rate("Minimum job charge", 1200)], minimumTotal: 1200 }), []);
  assert.deepEqual(minimumAsRate({ rates: [rate("Stump grinding, minimum per stump", 120)] }), []);
  assert.deepEqual(minimumAsRate({ rates: [rate("Cedar privacy fence, 6 ft tall", 34)] }), []);
});
