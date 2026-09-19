/**
 * Estimate-tool engine tests (lib/estimator.ts). Pure — no DB, no network.
 * Run: npx tsx scripts/test-estimator.ts
 */
import assert from "node:assert";
import {
  compileSpec,
  evaluate,
  parseExpr,
  runEstimator,
  coerceInputs,
  toIdentifier,
  usesAtlas,
  type EvalCtx,
  type PriceBookEntry,
} from "../lib/estimator";

const book: PriceBookEntry[] = [
  { id: "wi_wash", name: "House Washing", unitPrice: 250, unitCost: 60 },
  { id: "wi_drive", name: "Driveway Cleaning", unitPrice: 120, unitCost: 30 },
  { id: "wi_hour", name: "Labor (hourly)", unitPrice: 95, unitCost: 40 },
];

const ctx = (vars: Record<string, unknown> = {}): EvalCtx => ({
  vars: vars as EvalCtx["vars"],
  priceBook: new Map(book.map((b) => [b.name.toLowerCase(), b])),
});
const ev = (src: string, vars: Record<string, unknown> = {}) => evaluate(parseExpr(src), ctx(vars));

// 1. expression language
assert.equal(ev("1 + 2 * 3"), 7);
assert.equal(ev("(1 + 2) * 3"), 9);
assert.equal(ev("10 / 4"), 2.5);
assert.equal(ev("10 % 4"), 2);
assert.equal(ev("-x + 5", { x: 2 }), 3);
assert.equal(ev("x > 3 and y < 3", { x: 5, y: 1 }), true);
assert.equal(ev("x > 3 && y < 3", { x: 5, y: 5 }), false);
assert.equal(ev("not flag", { flag: false }), true);
assert.equal(ev("size == 'Large'", { size: "large" }), true, "string compare is case-insensitive");
assert.equal(ev("stories == '2'", { stories: 2 }), true, "number vs numeric string compares numerically");
assert.equal(ev("x >= 10 ? 'big' : 'small'", { x: 12 }), "big");
assert.equal(ev("if(x > 1, 100, 50)", { x: 0 }), 50);
assert.equal(ev("min(3, 9, 1)"), 1);
assert.equal(ev("max(3, 9, 1)"), 9);
assert.equal(ev("round(2.345, 2)"), 2.35);
assert.equal(ev("round(2.5)"), 3);
assert.equal(ev("floor(2.9)"), 2);
assert.equal(ev("ceil(2.1)"), 3);
assert.equal(ev("clamp(50, 0, 10)"), 10);
assert.equal(ev("pct(200, 15)"), 30);
assert.equal(ev("roundTo(123, 5)"), 125);
assert.equal(ev("tier(400, [[500, 0.30], [2000, 0.22]], 0.18)"), 0.3);
assert.equal(ev("tier(1500, [[500, 0.30], [2000, 0.22]], 0.18)"), 0.22);
assert.equal(ev("tier(9000, [[500, 0.30], [2000, 0.22]], 0.18)"), 0.18);
assert.equal(ev("tier(9000, [[500, 0.30], [null, 0.10]])"), 0.1, "null upTo is a catch-all");
assert.equal(ev("lookup(size, {small: 100, large: 200}, 150)", { size: "Large" }), 200);
assert.equal(ev("lookup(size, {small: 100, large: 200}, 150)", { size: "xl" }), 150);
assert.equal(ev("price('House Washing') * 2"), 500);
assert.equal(ev('cost("Driveway Cleaning")'), 30);
assert.equal(ev("len(notes)", { notes: "abc" }), 3);
assert.equal(ev("contains(notes, 'DECK')", { notes: "wash the deck too" }), true);
assert.equal(ev("'a' + 'b'"), "ab");
assert.equal(ev("number('12')"), 12);
console.log("ok 1: expression language");

// 2. expression errors are human, never throws out of the sandbox
assert.throws(() => ev("1 / 0"), /Division by zero/);
assert.throws(() => ev("nope + 1"), /Unknown name "nope"/);
assert.throws(() => ev("foo(1)"), /Unknown function foo/);
assert.throws(() => ev("price('Nope')"), /Price book has no item named "Nope"/);
assert.throws(() => ev("tier(50, [[10, 1]])"), /above every tier/);
assert.throws(() => parseExpr("1 +"), /Unexpected end/);
assert.throws(() => parseExpr("(1 + 2"), /Expected "\)"/);
assert.throws(() => parseExpr("'unterminated"), /Unterminated/);
assert.throws(() => parseExpr("a; b"), /Unexpected/);
assert.throws(() => parseExpr("x".repeat(600)), /longer than/);
assert.throws(() => ev("'a' * 2"), /must be a number/);
console.log("ok 2: expression errors");

// 3. compile: happy path
const spec = {
  intro: "Driveway + house wash pricing",
  inputs: [
    { id: "sqft", label: "Driveway size", type: "number", unit: "sq ft", min: 0 },
    { id: "stories", label: "Stories", type: "select", options: [{ value: "1", label: "One" }, { value: "2", label: "Two" }], default: "1" },
    { id: "sealant", label: "Add sealant?", type: "toggle" },
    { id: "house", label: "Wash the house too?", type: "toggle", default: true },
    { id: "notes", label: "Notes", type: "text" },
  ],
  variables: [{ id: "rate", expr: "tier(sqft, [[500, 0.30], [2000, 0.22]], 0.18)" }],
  lines: [
    { name: "Driveway cleaning", description: "{sqft} sq ft at {rate|money}/sq ft", quantity: "sqft", unitPrice: "rate", workItemName: "Driveway Cleaning" },
    { name: "House washing", when: "house", workItemName: "House Washing" },
    { name: "Two-story surcharge", when: "stories == '2'", unitPrice: "pct(price('House Washing'), 20)" },
    { name: "Sealant", when: "sealant", quantity: "sqft", unitPrice: "0.45", isOptional: true },
  ],
  minimumTotal: 150,
  quoteTitle: "Pressure washing — {sqft|int} sq ft",
  clientMessage: "Estimated at {subtotal|money}. Thanks!",
};
const c = compileSpec(spec);
assert.ok(c.ok, `compiles: ${!c.ok ? c.errors.join("; ") : ""}`);
if (c.ok) {
  assert.deepEqual(c.compiled.priceBookNames.sort(), ["Driveway Cleaning", "House Washing"]);
  assert.equal(c.compiled.spec.inputs[0].type, "number");
  assert.equal((c.compiled.spec.inputs[0] as { required?: boolean }).required, true, "numbers default to required");
  assert.equal(usesAtlas(c.compiled.spec), false, "no assist → free to run");
}
console.log("ok 3: compile happy path");

// 4. run: tiers, conditions, price-book link, optional lines, fractional folding
{
  const r = runEstimator(spec, { sqft: "1,200", stories: "2", sealant: "true" }, book);
  assert.ok(r.ok, `runs: ${!r.ok ? r.errors.join("; ") : ""}`);
  if (r.ok) {
    assert.equal(r.lines.length, 4);
    const [drive, house, surcharge, sealant] = r.lines;
    assert.equal(drive.quantity, 1200);
    assert.equal(drive.unitPrice, 0.22);
    assert.equal(drive.workItemId, "wi_drive");
    assert.equal(drive.unitCost, 30);
    assert.equal(drive.description, "1200 sq ft at $0.22/sq ft");
    assert.equal(house.unitPrice, 250, "unitPrice falls back to the price-book price");
    assert.equal(house.workItemId, "wi_wash");
    assert.equal(surcharge.unitPrice, 50);
    assert.equal(sealant.isOptional, true);
    assert.equal(sealant.unitPrice, 0.45);
    assert.equal(r.subtotal, 264 + 250 + 50, "subtotal excludes optional lines");
    assert.equal(r.title, "Pressure washing — 1200 sq ft");
    assert.equal(r.clientMessage, "Estimated at $564.00. Thanks!");
  }
  // toggles off + one story: house line and surcharge drop out
  const r2 = runEstimator(spec, { sqft: 300, house: false }, book);
  assert.ok(r2.ok);
  if (r2.ok) {
    assert.deepEqual(r2.lines.map((l) => l.name), ["Driveway cleaning", "Minimum job charge"], "minimum tops up");
    assert.equal(r2.lines[1].unitPrice, 150 - 90);
    assert.equal(r2.subtotal, 150);
  }
}
{
  const hourly = compileSpec({
    inputs: [{ id: "hours", label: "Hours", type: "number", step: 0.5 }],
    lines: [{ name: "Labor", quantity: "hours", workItemName: "Labor (hourly)" }],
  });
  assert.ok(hourly.ok);
  const r = runEstimator(hourly.ok ? hourly.compiled.spec : {}, { hours: 2.5 }, book);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.lines[0].quantity, 1, "fractional quantity folds to one unit");
    assert.equal(r.lines[0].unitPrice, 237.5);
    assert.equal(r.lines[0].description, "2.5 × $95.00");
  }
}
console.log("ok 4: run");

// 5. run-time input problems + missing price-book items are reported, not thrown
{
  const r = runEstimator(spec, {}, book);
  assert.ok(!r.ok && r.errors[0] === "Driveway size is required");
  const r2 = runEstimator(spec, { sqft: -5 }, book);
  assert.ok(!r2.ok && /at least 0/.test(r2.errors[0]));
  const r3 = runEstimator(spec, { sqft: 100, stories: "3" }, book);
  assert.ok(!r3.ok && /not an option/.test(r3.errors[0]));
  const r4 = runEstimator(spec, { sqft: 100 }, []);
  assert.ok(!r4.ok && /Price book has no item/.test(r4.errors[0]));
  const zero = compileSpec({ inputs: [{ id: "n", label: "N", type: "number" }], lines: [{ name: "X", quantity: "n", unitPrice: "10" }] });
  const r5 = runEstimator(zero.ok ? zero.compiled.spec : {}, { n: 0 }, book);
  assert.ok(!r5.ok && /Nothing to quote/.test(r5.errors[0]));
}
console.log("ok 5: run-time problems");

// 6. compile rejects broken specs with actionable messages
{
  const bad = compileSpec({
    inputs: [
      { id: "1bad", label: "Bad id", type: "number" },
      { id: "min", label: "Reserved", type: "number" },
      { id: "size", label: "Size", type: "select", options: ["only one"] },
      { id: "dup", label: "Dup", type: "number" },
      { id: "dup", label: "Dup again", type: "number" },
      { label: "No type", type: "color" },
    ],
    variables: [{ id: "v", expr: "nope * 2" }],
    lines: [
      { name: "", unitPrice: "1" },
      { name: "No price" },
      { name: "Bad expr", unitPrice: "1 +" },
      { name: "Bad tpl", description: "{unclosed", unitPrice: "1" },
    ],
    minimumTotal: -1,
  });
  assert.ok(!bad.ok);
  if (!bad.ok) {
    const all = bad.errors.join("\n");
    for (const needle of [
      'Input id "1bad"', 'Input id "min" is a reserved word', "needs at least 2 options", 'Duplicate id "dup"',
      "type must be number, select, toggle or text", 'Variable "v": unknown name "nope"', "Line 1 needs a name",
      'Line "No price": needs a unitPrice expression or a workItemName', 'Line "Bad expr" unitPrice', "Unclosed {", "minimumTotal must be",
    ]) {
      assert.ok(all.includes(needle), `expected error containing: ${needle}\n--\n${all}`);
    }
  }
  assert.ok(!compileSpec({ inputs: [], lines: [] }).ok, "no lines → error");
  assert.ok(!compileSpec(null).ok);
  assert.ok(!compileSpec("garbage").ok);
  const assistBad = compileSpec({ inputs: [{ id: "t", label: "T", type: "text" }], lines: [{ name: "X", unitPrice: "1" }], assist: {} });
  assert.ok(!assistBad.ok && /assist needs at least one/.test(assistBad.errors.join()));
  const assistOk = compileSpec({ inputs: [{ id: "n", label: "N", type: "number" }], lines: [{ name: "X", unitPrice: "n" }], assist: { instructions: "guess n" } });
  assert.ok(assistOk.ok && usesAtlas(assistOk.compiled.spec), "assist → uses Atlas");
  // ids fall back to slugged labels; select options may be plain strings
  const slug = compileSpec({ inputs: [{ label: "Sq. Footage!", type: "number" }, { label: "Size", type: "select", options: ["Small", "Large"] }], lines: [{ name: "X", unitPrice: "sq_footage" }] });
  assert.ok(slug.ok && slug.compiled.spec.inputs[0].id === "sq_footage");
  assert.equal(toIdentifier("2nd floor"), "x_2nd_floor");
}
console.log("ok 6: compile errors");

// 7. coerceInputs: defaults, toggles from strings, text length cap
{
  const ok = compileSpec(spec);
  if (ok.ok) {
    const { values, problems } = coerceInputs(ok.compiled.spec, { sqft: 10, sealant: "yes", notes: "x".repeat(1000) });
    assert.equal(problems.length, 0);
    assert.equal(values.stories, "1", "select default applies");
    assert.equal(values.house, true, "toggle default applies");
    assert.equal(values.sealant, true);
    assert.equal((values.notes as string).length, 500);
  }
}
console.log("ok 7: coerce inputs");

// 8. hostile: deep nesting + huge numbers are bounded
{
  assert.throws(() => ev("(".repeat(70) + "1" + ")".repeat(70)), /too deeply nested/);
  assert.equal(ev("(".repeat(20) + "1" + ")".repeat(20)), 1, "reasonable nesting is fine");
  const huge = compileSpec({ inputs: [{ id: "n", label: "N", type: "number" }], lines: [{ name: "X", quantity: "n", unitPrice: "1" }] });
  const r = runEstimator(huge.ok ? huge.compiled.spec : {}, { n: 1e9 }, book);
  assert.ok(!r.ok && /unreasonably large/.test(r.errors[0]));
  const rich = compileSpec({ inputs: [{ id: "n", label: "N", type: "number" }], lines: [{ name: "X", unitPrice: "n * 1000000" }] });
  const r2 = runEstimator(rich.ok ? rich.compiled.spec : {}, { n: 5 }, book);
  assert.ok(!r2.ok && /above \$1,000,000/.test(r2.errors[0]));
}
console.log("ok 8: hostile inputs bounded");

console.log("\nestimator: all green");
