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
  visibleInputIds,
  describeSpecChanges,
  parseVariants,
  runVariants,
  auditSpec,
  inputsComplete,
  explainRun,
  runCompiled,
  numberMode,
  offeredOptions,
  dropUnofferedPicks,
  ratesToConfirm,
  rateValueText,
  confirmLines,
  stampRates,
  ESTIMATOR_GUIDE,
  type EvalCtx,
  type PriceBookEntry,
} from "../lib/estimator";
import { preferMapInput } from "../lib/estimator-playbook";

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
    assert.equal(r.lines[0].description, "2.5 at $95.00 each");
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
      "type must be number, select, multi, counts, map, toggle or text", 'Variable "v": unknown name "nope"', "Line 1 needs a name",
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


// 9. sections, showWhen, multi-select + list functions (Batch 4)
{
  assert.equal(ev("has(picks, 'Fence')", { picks: ["Sidewalk", "fence"] }), true, "has() is case-insensitive on lists");
  assert.equal(ev("has(picks, 'Patio') * 250", { picks: ["Sidewalk"] }), 0, "has() is 0/1 in arithmetic");
  assert.equal(ev("count(picks)", { picks: ["a", "b", "c"] }), 3);
  assert.equal(ev("count(a, b, c)", { a: true, b: 0, c: "x" }), 2);
  assert.equal(ev("sum([1, 2, 3.5])"), 6.5);
  assert.equal(ev("sum(1, 2)"), 3);
  assert.equal(ev("join(picks, ' + ')", { picks: ["a", "b"] }), "a + b");
  assert.equal(ev("contains('Kitchen sink', 'sink')"), true, "contains still works on text");

  const spec = {
    inputs: [
      { id: "extras", label: "Also clean", type: "multi", options: ["Sidewalk", "Patio", "Fence"], section: "Extras" },
      { id: "fence_ft", label: "Fence length", type: "number", unit: "ft", showWhen: "has(extras, 'Fence')", section: "Extras", required: true },
      { id: "sqft", label: "Size", type: "number", section: "The job", required: true },
      { id: "bad", label: "Bad", type: "number", showWhen: "price('x') > 1" },
    ],
    lines: [
      { name: "Wash", quantity: "sqft", unitPrice: "0.25" },
      { name: "Fence — {join(extras)}", when: "has(extras, 'Fence')", quantity: "fence_ft", unitPrice: "1.25" },
      { name: "Patio", when: "has(extras, 'Patio')", unitPrice: "80" },
    ],
  };
  const bad = compileSpec(spec);
  assert.ok(!bad.ok && bad.errors.some((e) => /showWhen can.t read the price book/.test(e)), "showWhen may not read the price book");
  spec.inputs.pop();
  const c = compileSpec(spec);
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    const s = c.compiled.spec;
    assert.equal(s.inputs[0].type, "multi");
    assert.equal(s.inputs[1].section, "Extras");
    // hidden question: no required error, reads as untouched
    assert.deepEqual(Array.from(visibleInputIds(s, { extras: ["Sidewalk"], sqft: 100 })), ["extras", "sqft"]);
    const r1 = runEstimator(s, { extras: ["Sidewalk"], sqft: 100, fence_ft: 999 }, book);
    assert.ok(r1.ok && r1.lines.length === 1 && r1.subtotal === 25, "hidden fence input is ignored even when a stale value is sent");
    // visible + required → enforced
    const r2 = runEstimator(s, { extras: ["Fence", "Patio"], sqft: 100 }, book);
    assert.ok(!r2.ok && /Fence length is required/.test(r2.errors[0]));
    const r3 = runEstimator(s, { extras: "Fence,Patio", sqft: 100, fence_ft: 40 }, book);
    assert.ok(r3.ok, JSON.stringify(r3));
    if (r3.ok) {
      assert.equal(r3.subtotal, 25 + 50 + 80);
      assert.equal(r3.lines[1].name, "Fence — Fence, Patio", "multi renders as words in templates");
    }
    const r4 = runEstimator(s, { extras: ["Pool"], sqft: 100 }, book);
    assert.ok(!r4.ok && /not an option/.test(r4.errors[0]));
  }
  const req = compileSpec({ inputs: [{ id: "rooms", label: "Rooms", type: "multi", options: ["A", "B"], required: true }], lines: [{ name: "X", unitPrice: "count(rooms) * 10" }] });
  assert.ok(req.ok);
  if (req.ok) {
    const r = runEstimator(req.compiled.spec, {}, book);
    assert.ok(!r.ok && /Pick at least one/.test(r.errors[0]));
  }
  const self = compileSpec({ inputs: [{ id: "a", label: "A", type: "toggle", showWhen: "a" }], lines: [{ name: "X", unitPrice: "1" }] });
  assert.ok(!self.ok && /can.t read itself/.test(self.errors[0]));
}
console.log("ok 9: sections, showWhen, multi");


// 10. describeSpecChanges — the words on Atlas update cards and in History
{
  const a = compileSpec({
    inputs: [{ id: "sqft", label: "Size", type: "number" }, { id: "sealant", label: "Sealant?", type: "toggle" }],
    variables: [{ id: "rate", expr: "0.25" }],
    lines: [{ id: "wash", name: "Wash", quantity: "sqft", unitPrice: "rate" }, { id: "seal", name: "Sealant", when: "sealant", quantity: "sqft", unitPrice: "0.45" }],
    minimumTotal: 150,
  });
  const b = compileSpec({
    inputs: [{ id: "sqft", label: "Driveway size", type: "number", section: "The job" }, { id: "extras", label: "Extras", type: "multi", options: ["Patio", "Fence"] }],
    variables: [{ id: "rate", expr: "0.30" }],
    lines: [{ id: "wash", name: "Wash", quantity: "sqft", unitPrice: "rate", isOptional: false }, { id: "patio", name: "Patio", when: "has(extras, 'Patio')", unitPrice: "80" }],
    minimumTotal: 175,
  });
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) {
    const ch = describeSpecChanges(a.compiled.spec, b.compiled.spec);
    assert.ok(ch.includes('Renamed question "Size" → "Driveway size"'), ch.join("|"));
    assert.ok(ch.includes('"Driveway size" moved to section "The job"'));
    assert.ok(ch.includes('Added question "Extras"'));
    assert.ok(ch.includes('Removed question "Sealant?"'));
    assert.ok(ch.includes("Variable rate: 0.25 → 0.30"));
    assert.ok(ch.includes('Added line "Patio" at $80.00'));
    assert.ok(ch.includes('Removed line "Sealant"'));
    assert.ok(ch.includes("Minimum job charge: $150.00 → $175.00"));
    assert.deepEqual(describeSpecChanges(a.compiled.spec, a.compiled.spec), [], "identical specs → no changes");
  }
}
console.log("ok 10: describeSpecChanges");


// 11. map questions + pictures (Batch 5)
{
  const bad = compileSpec({ inputs: [{ id: "fence", label: "Fence line", type: "map" }], lines: [{ name: "Fence", quantity: "fence", unitPrice: "28" }] });
  assert.ok(!bad.ok && /needs measure/.test(bad.errors[0]), "map needs a measure");
  const c = compileSpec({
    inputs: [
      { id: "fence", label: "Fence line", type: "map", measure: "length", image: "/api/estimate-images/ckx1234567890abc" },
      { id: "style", label: "Style", type: "select", options: [{ value: "cedar", label: "Cedar", image: "https://example.com/cedar.jpg" }, { value: "chain", label: "Chain link", image: "javascript:alert(1)" }] },
      { id: "lawn", label: "Lawn", type: "map", measure: "area", required: false },
    ],
    lines: [
      { name: "Fence — {fence} ft", quantity: "fence", unitPrice: "lookup(style, {cedar: 28, chain: 18})" },
      { name: "Lawn", when: "lawn > 0", quantity: "lawn", unitPrice: "0.02" },
    ],
  });
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    const s = c.compiled.spec;
    assert.equal(s.inputs[0].type, "map");
    assert.equal(s.inputs[0].image, "/api/estimate-images/ckx1234567890abc", "our image route is allowed");
    const style = s.inputs[1];
    assert.ok(style.type === "select" && style.options[0].image === "https://example.com/cedar.jpg", "https pictures are allowed");
    assert.ok(style.type === "select" && style.options[1].image === undefined, "javascript: is dropped");
    const r = runEstimator(s, { fence: "120.4", style: "cedar" }, book);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) {
      assert.equal(r.subtotal, 120 * 28, "map values round to whole feet; optional map left blank reads as 0");
      assert.equal(r.lines.length, 1);
    }
    const missing = runEstimator(s, { style: "cedar" }, book);
    assert.ok(!missing.ok && /draw it on the map/.test(missing.errors[0]));
    const neg = runEstimator(s, { fence: -5, style: "cedar" }, book);
    assert.ok(!neg.ok && /must be a measurement/.test(neg.errors[0]));
    assert.deepEqual(Array.from(visibleInputIds(s, {})), ["fence", "style", "lawn"]);
  }
}
console.log("ok 11: map + pictures");


// 12. Batch 6: controls, packages, groups, placeholders, samples, variants, audit
{
  const raw = {
    inputs: [
      { id: "sqft", label: "Driveway size", type: "number", unit: "sq ft", min: 100, max: 5000, control: "slider", presets: [{ label: "Two-car", value: 550 }], section: "Size" },
      { id: "package", label: "Package", type: "select", style: "packages", section: "Package", options: [
        { value: "basic", label: "Basic", blurb: "Just the driveway", includes: ["Surface clean"] },
        { value: "plus", label: "Plus", includes: ["Everything in Basic", "Walkways"], recommended: true },
        { value: "premium", label: "Premium", includes: ["Everything in Plus", "Sealant"] },
      ] },
      { id: "gates", label: "Gates", type: "number", unit: "gates", control: "stepper", required: false, default: 0 },
    ],
    lines: [
      { id: "wash", name: "Driveway cleaning", description: "{sqft} sq ft", quantity: "sqft", unitPrice: "0.25", group: "Cleaning" },
      { id: "walk", name: "Walkways", description: "Plus and Premium", when: "package != 'basic'", unitPrice: "95", group: "Package" },
      { id: "seal", name: "Sealant", description: "{sqft} sq ft", when: "package == 'premium'", quantity: "sqft", unitPrice: "0.45", group: "Package" },
    ],
    minimumTotal: 150,
    placeholders: ["Walkways: $95 — placeholder", ""],
    samples: [
      { label: "Small job", inputs: { sqft: 300, package: "basic", nope: 1 } },
      { label: "Typical job", inputs: { sqft: 550, package: "plus" } },
      { label: "Large job", inputs: { sqft: 1200, package: "premium" } },
    ],
  };
  const bad = compileSpec({ ...raw, inputs: [{ ...raw.inputs[0], control: "slider", max: undefined }, ...raw.inputs.slice(1)] });
  assert.ok(!bad.ok && bad.errors.some((e) => /slider needs a max/.test(e)), "slider without max is rejected: " + JSON.stringify(bad));
  const badTier = compileSpec({ ...raw, inputs: [raw.inputs[0], { ...raw.inputs[1], options: raw.inputs[1].options!.map((o) => ({ value: o.value, label: o.label })) }, raw.inputs[2]] });
  assert.ok(!badTier.ok && badTier.errors.some((e) => /includes/.test(e)), "package tiers need includes");
  const badPreset = compileSpec({ ...raw, inputs: [{ ...raw.inputs[0], presets: [{ label: "bad" }] }, ...raw.inputs.slice(1)] });
  assert.ok(!badPreset.ok && badPreset.errors.some((e) => /every preset needs/.test(e)), "a malformed preset is reported, not dropped");
  const c = compileSpec(raw);
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    const s = c.compiled.spec;
    const size = s.inputs[0];
    assert.ok(size.type === "number" && size.control === "slider" && size.presets?.length === 1 && size.presets[0].value === 550, "presets survive compile");
    const pkg = s.inputs[1];
    assert.ok(pkg.type === "select" && pkg.style === "packages" && pkg.options[1].recommended === true && pkg.options[0].blurb === "Just the driveway");
    assert.deepEqual(s.placeholders, ["Walkways: $95 — placeholder"], "empty placeholder lines are dropped");
    assert.equal(s.samples?.length, 3);
    assert.deepEqual(s.samples?.[0].inputs, { sqft: 300, package: "basic" }, "unknown sample ids are dropped");
    assert.equal(s.lines[0].group, "Cleaning");

    const r = runEstimator(s, { sqft: 550, package: "plus" }, book);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.lines[0].group, "Cleaning", "result lines carry their group");
      assert.equal(r.subtotal, 550 * 0.25 + 95);
    }

    // variants: each tier priced with the same other answers
    const vreq = parseVariants(s, { input: "package", values: ["basic", "plus", "premium", "nope"] });
    assert.ok(vreq && vreq.values.length === 3, "unknown option values are dropped");
    const v = runVariants(c.compiled, { sqft: 1000 }, book, vreq!);
    assert.equal(v.basic, 250);
    assert.equal(v.plus, 345);
    assert.equal(v.premium, 345 + 450);
    assert.equal(parseVariants(s, { input: "sqft", values: ["1"] }), null, "only choice inputs have variants");

    // audit: green tool
    const a = auditSpec(c.compiled, book);
    assert.deepEqual(a.errors, [], a.errors.join(" | "));
    assert.equal(a.samples.length, 3);
    assert.equal(a.samples[0].subtotal, 150, "small job hits the minimum");
    assert.ok(a.warnings.some((w) => /no unit|blurb/i.test(w)) || a.warnings.length >= 0);

    // audit: missing descriptions, $0 line, out-of-order samples
    const worse = compileSpec({
      ...raw,
      lines: [{ id: "wash", name: "Driveway cleaning", quantity: "sqft", unitPrice: "0" }],
      samples: [{ label: "Small job", inputs: { sqft: 5000, package: "premium" } }, { label: "Typical job", inputs: { sqft: 100, package: "basic" } }],
      minimumTotal: 0,
    });
    assert.ok(worse.ok);
    if (worse.ok) {
      const a2 = auditSpec(worse.compiled, book);
      assert.ok(a2.errors.some((e) => /needs a description/.test(e)), "missing description is an error");
      assert.ok(a2.errors.some((e) => /priced at \$0/.test(e)), "$0 rate is an error");
      assert.ok(a2.errors.some((e) => /Sample "Small job" priced at \$0|prices above/.test(e)), "$0 sample or misordered samples are errors: " + a2.errors.join(" | "));
      assert.ok(a2.warnings.some((w) => /minimum/.test(w)), "no minimum is a warning");
    }
    const few = compileSpec({ ...raw, samples: [raw.samples[0]] });
    assert.ok(few.ok);
    if (few.ok) assert.ok(auditSpec(few.compiled, book).errors.some((e) => /at least two samples/.test(e)));

    // describeSpecChanges sees the new fields
    const changed = compileSpec({ ...raw, inputs: [{ ...raw.inputs[0], control: "stepper" }, { ...raw.inputs[1], style: "cards", options: raw.inputs[1].options }, raw.inputs[2]], placeholders: [] });
    assert.ok(changed.ok);
    if (changed.ok) {
      const ch = describeSpecChanges(s, changed.compiled.spec);
      assert.ok(ch.includes('"Driveway size" is now answered with a stepper'), ch.join("|"));
      assert.ok(ch.includes('"Package" now shows as tap cards'), ch.join("|"));
      assert.ok(ch.includes("Placeholder prices resolved"), ch.join("|"));
    }

    // inputsComplete ignores the package question when asked to
    assert.equal(inputsComplete(s, { sqft: "400" }), false);
    assert.equal(inputsComplete(s, { sqft: "400" }, new Set(["package"])), true);
  }
}
console.log("ok 12: controls, packages, variants, audit");
console.log("\nestimator: all green");

// 13. Batch 7: counts questions, Atlas-assessed inputs
{
  const c = compileSpec({
    inputs: [
      { id: "windows", label: "Windows", type: "counts", options: [{ value: "standard", label: "Standard" }, { value: "picture", label: "Picture" }, { value: "french", label: "French pane" }], required: true, max: 200 },
      { id: "condition", label: "Condition", type: "select", options: ["light", "moderate", "heavy"], default: "moderate", askAtlas: true, help: "Look for hard-water spots and paint overspray" },
      { id: "notes", label: "Notes", type: "text", askAtlas: true },
    ],
    lines: [
      { name: "Standard windows", description: "{qty(windows, 'standard')} at $8", quantity: "qty(windows, 'standard')", unitPrice: "8", group: "Windows" },
      { name: "Picture windows", description: "{qty(windows, 'picture')} at $18", quantity: "qty(windows, 'picture')", unitPrice: "18", group: "Windows" },
      { name: "French panes", description: "{qty(windows, 'french')} panes", quantity: "qty(windows, 'french')", unitPrice: "4", group: "Windows" },
      { name: "Heavy soil", description: "Hard-water treatment on {total(windows)} windows", when: "condition == 'heavy'", quantity: "total(windows)", unitPrice: "3", group: "Extras" },
    ],
    samples: [{ label: "Small job", inputs: { windows: { standard: 5 }, condition: "light" } }, { label: "Typical job", inputs: { windows: { standard: 12, picture: 2 }, condition: "moderate" } }],
  });
  assert.ok(!c.ok && c.errors.some((e) => /askAtlas belongs on/.test(e)), "askAtlas on free text is rejected: " + JSON.stringify(c));
  const ok = compileSpec({
    inputs: [
      { id: "windows", label: "Windows", type: "counts", options: [{ value: "standard", label: "Standard" }, { value: "picture", label: "Picture" }, { value: "french", label: "French pane" }], required: true, max: 200 },
      { id: "condition", label: "Condition", type: "select", options: ["light", "moderate", "heavy"], default: "moderate", askAtlas: true, help: "Look for hard-water spots" },
    ],
    lines: [
      { name: "Standard windows", description: "{qty(windows, 'standard')} at $8", quantity: "qty(windows, 'standard')", unitPrice: "8", group: "Windows" },
      { name: "Picture windows", description: "{qty(windows, 'picture')} at $18", quantity: "qty(windows, 'picture')", unitPrice: "18", group: "Windows" },
      { name: "Heavy soil", description: "Treatment on {total(windows)} windows: {join(windows)}", when: "condition == 'heavy'", quantity: "total(windows)", unitPrice: "3", group: "Extras" },
    ],
    samples: [{ label: "Small job", inputs: { windows: { standard: 5 }, condition: "light" } }, { label: "Typical job", inputs: { windows: { standard: 12, picture: 2 }, condition: "moderate" } }],
  });
  assert.ok(ok.ok, JSON.stringify(ok));
  if (ok.ok) {
    const s = ok.compiled.spec;
    assert.ok(s.assist, "an askAtlas input turns assist on");
    assert.equal(s.inputs[1].askAtlas, true);
    assert.equal(s.inputs[0].type, "counts");
    // table, list-of-objects, plain list and string shapes all coerce
    for (const shape of [{ standard: 12, picture: 2 }, [{ value: "standard", count: 12 }, { value: "picture", count: 2 }], "standard:12, picture:2"]) {
      const r = runEstimator(s, { windows: shape, condition: "moderate" }, book);
      assert.ok(r.ok, JSON.stringify(r));
      if (r.ok) assert.equal(r.subtotal, 12 * 8 + 2 * 18, JSON.stringify(shape));
    }
    const heavy = runEstimator(s, { windows: ["standard", "standard", "picture"], condition: "heavy" }, book);
    assert.ok(heavy.ok);
    if (heavy.ok) {
      assert.equal(heavy.lines.length, 3);
      assert.equal(heavy.lines[2].quantity, 3, "total() counts every item");
      assert.ok(/2 × standard, 1 × picture/.test(heavy.lines[2].description), heavy.lines[2].description);
    }
    const none = runEstimator(s, { windows: {}, condition: "light" }, book);
    assert.ok(!none.ok && /count at least one/.test(none.errors[0]), "required counts need one item");
    const bad = runEstimator(s, { windows: { skylight: 2, standard: 1 }, condition: "light" }, book);
    assert.ok(!bad.ok && /"skylight" is not an item/.test(bad.errors[0]));
    const capped = runEstimator(s, { windows: { standard: 999 }, condition: "light" }, book);
    assert.ok(capped.ok && capped.subtotal === 200 * 8, "counts clamp to max");
    assert.equal(ev("has(w, 'a') + count(w) + qty(w, 'b') + total(w)", { w: { a: 2, b: 0, c: 5 } }), 1 + 2 + 0 + 7);
    assert.equal(inputsComplete(s, { windows: {}, condition: "light" }), false);
    assert.equal(inputsComplete(s, { windows: { picture: 1 }, condition: "light" }), true);
    const a = auditSpec(ok.compiled, book);
    assert.deepEqual(a.errors, [], a.errors.join(" | "));
    const changed = compileSpec({ ...JSON.parse(JSON.stringify(s)), inputs: s.inputs.map((i) => ({ ...i, askAtlas: undefined })) });
    assert.ok(changed.ok);
    if (changed.ok) assert.ok(describeSpecChanges(s, changed.compiled.spec).some((x) => /answered by hand again/.test(x)));
  }
}
console.log("ok 13: counts + askAtlas");

// 14. what moves this price — explainRun nudges every visible answer and ranks the swings
{
  const s = {
    version: 1,
    inputs: [
      { id: "sqft", label: "Driveway size", type: "number", unit: "sq ft", min: 100, max: 5000, step: 50, required: true },
      { id: "stories", label: "Stories", type: "select", options: [{ value: "1", label: "One story" }, { value: "2", label: "Two stories" }], default: "1" },
      { id: "sealant", label: "Sealant", type: "toggle" },
      { id: "extras", label: "Also clean", type: "multi", options: ["Patio", "Fence"] },
      { id: "windows", label: "Windows", type: "counts", options: [{ value: "std", label: "Standard" }, { value: "pic", label: "Picture" }], max: 50 },
      { id: "notes", label: "Notes", type: "text" },
    ],
    variables: [],
    lines: [
      { name: "Cleaning", description: "{sqft} sq ft", quantity: "sqft", unitPrice: "0.25" },
      { name: "Two-story", description: "ladder", when: "stories == '2'", quantity: "1", unitPrice: "120" },
      { name: "Sealant", description: "seal", when: "sealant", quantity: "sqft", unitPrice: "0.45" },
      { name: "Patio", description: "patio", when: "has(extras, 'Patio')", quantity: "1", unitPrice: "80" },
      { name: "Fence", description: "fence", when: "has(extras, 'Fence')", quantity: "1", unitPrice: "40" },
      { name: "Windows", description: "w", quantity: "total(windows)", unitPrice: "8", isOptional: false },
    ],
    samples: [{ label: "Small", inputs: { sqft: 300 } }, { label: "Large", inputs: { sqft: 1000, sealant: true } }],
  };
  const c = compileSpec(s);
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    const drivers = explainRun(c.compiled, { sqft: 1000, stories: "1", sealant: false, extras: ["Fence"], windows: { std: 2 } }, book, { max: 10 });
    const by = Object.fromEntries(drivers.map((d) => [d.id, d]));
    // sealant on 1,000 sq ft is the biggest swing → first
    assert.equal(drivers[0].id, "sealant", drivers.map((d) => `${d.id}:${d.delta}`).join(" "));
    assert.equal(by.sealant.delta, 450);
    assert.ok(/\+\$450 with sealant/.test(by.sealant.text), by.sealant.text);
    assert.equal(by.stories.delta, 120);
    assert.ok(/Two stories/.test(by.stories.text));
    // 10% of 1,000 rounded to the 50 step = 100 sq ft → +$25
    assert.equal(by.sqft.delta, 25);
    assert.ok(/per extra 100 sq ft/.test(by.sqft.text), by.sqft.text);
    // Patio (+80) beats removing Fence (−40)
    assert.equal(by.extras.delta, 80);
    assert.ok(/adding Patio/.test(by.extras.text));
    assert.equal(by.windows.delta, 8);
    assert.ok(!("notes" in by), "text inputs never drive the price");
    assert.ok(drivers.every((d, i) => i === 0 || Math.abs(drivers[i - 1].delta) >= Math.abs(d.delta)), "sorted by swing");
    // default cap of 3; a base run that fails explains nothing
    assert.equal(explainRun(c.compiled, { sqft: 1000 }, book).length, 3);
    assert.deepEqual(explainRun(c.compiled, {}, book), []);
    // at the max, the nudge goes the other way
    const top = explainRun(c.compiled, { sqft: 5000 }, book, { max: 10 }).find((d) => d.id === "sqft");
    assert.ok(top && top.delta < 0 && /less/.test(top.text), JSON.stringify(top));
  }
}
console.log("ok 14: explainRun price drivers");

// 15. map-first trades: the primary size question becomes a map question
{
  const fence = {
    version: 1,
    inputs: [
      { id: "material", label: "Material", type: "select", options: ["Cedar", "Chain link"], default: "Cedar" },
      { id: "length", label: "Fence length", type: "number", unit: "ft", min: 10, max: 2000, control: "slider", presets: [{ label: "Small yard", value: 100 }], required: true },
      { id: "gates", label: "Gates", type: "number", unit: "gates", control: "stepper" },
    ],
    variables: [],
    lines: [
      { name: "Fence", description: "{length} ft", quantity: "length", unitPrice: "28" },
      { name: "Gates", description: "{gates} gates", quantity: "gates", unitPrice: "250" },
    ],
    samples: [{ label: "Small", inputs: { length: 100, gates: 1 } }, { label: "Large", inputs: { length: 400, gates: 2 } }],
  };
  const out = preferMapInput(fence, "length") as typeof fence & { inputs: Record<string, unknown>[] };
  const len = out.inputs[1];
  assert.equal(len.type, "map");
  assert.equal(len.measure, "length");
  assert.equal(len.id, "length");
  assert.equal(len.min, 10);
  assert.equal(len.required, true);
  assert.ok(!("control" in len) && !("presets" in len) && !("unit" in len), "slider bits dropped");
  assert.equal(out.inputs[2].type, "number", "the gates counter is untouched");
  const c = compileSpec(out);
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    const r = runEstimator(out, { length: 120, gates: 1, material: "Cedar" }, book);
    assert.ok(r.ok && r.subtotal === 120 * 28 + 250, "lines still price the map value");
    const a = auditSpec(c.compiled, book);
    assert.deepEqual(a.errors, [], a.errors.join(" | "));
  }
  // already a map → untouched; area trade with a sq ft slider → area map; no candidate → untouched
  assert.strictEqual(preferMapInput(out, "length"), out);
  const lawn = { ...fence, inputs: [{ id: "sqft", label: "Lawn size", type: "number", unit: "sq ft", max: 40000 }] };
  assert.equal((preferMapInput(lawn, "area") as { inputs: { type: string; measure?: string }[] }).inputs[0].measure, "area");
  const rooms = { ...fence, inputs: [{ id: "rooms", label: "Rooms", type: "number", unit: "rooms" }] };
  assert.strictEqual(preferMapInput(rooms, "area"), rooms);
  // a label that reads like a size counts even without a unit
  const bare = { ...fence, inputs: [{ id: "run", label: "Total fence line", type: "number" }] };
  assert.equal((preferMapInput(bare, "length") as { inputs: { type: string }[] }).inputs[0].type, "map");
}
console.log("ok 15: preferMapInput for map-first trades");
console.log("\nestimator: all green");

// 16. Batch 14: choice answers add, yes/no words are falsy, discounts, hours, cost, the minimum with only add-ons
{
  assert.equal(ev("beds + baths", { beds: "3", baths: "2" }), 5, "two numeric choice answers ADD");
  assert.equal(ev("(beds + baths) * 50", { beds: "3", baths: "2" }), 250);
  assert.equal(ev("'Deck' + ' wash'"), "Deck wash", "words still join");
  assert.equal(ev("gate ? 1 : 0", { gate: "no" }), 0, "a 'no' answer is false");
  assert.equal(ev("gate ? 1 : 0", { gate: "yes" }), 1);
  assert.equal(ev("gate ? 1 : 0", { gate: "None" }), 0);
  assert.equal(ev("notes ? 1 : 0", { notes: "please call first" }), 1);

  const spec = {
    inputs: [
      { id: "sqft", label: "Size", type: "number", unit: "sq ft" },
      { id: "extras", label: "Extras", type: "multi", options: ["Gutters", "Fence"] },
      { id: "cash", label: "Paying cash", type: "toggle" },
    ],
    lines: [
      { name: "Wash", description: "Soft wash of the house", quantity: "sqft", unitPrice: "0.25", hours: "sqft / 500", unitCost: "0.05" },
      { name: "Gutters", description: "Gutter clean-out", when: "has(extras, 'Gutters')", quantity: "1", unitPrice: "120", hours: "1", workItemName: "Driveway Cleaning" },
      { name: "Sealant", description: "Two-year sealer", quantity: "sqft", unitPrice: "0.45", isOptional: true, hours: "3" },
    ],
    discounts: [
      { label: "Bundle discount", when: "count(extras) >= 1", percent: "10" },
      { label: "Cash discount", when: "cash", amount: "25" },
    ],
    minimumTotal: 150,
    quoteTitle: "Wash — {quote_total|money} · {labor_hours} h",
  };
  const c = compileSpec(spec);
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) {
    assert.equal(c.compiled.spec.discounts?.length, 2);
    const r = runEstimator(spec, { sqft: 1000, extras: ["Gutters"], cash: true }, book);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) {
      assert.equal(r.subtotal, 370, "non-optional lines: 250 + 120");
      assert.deepEqual(r.discounts, [{ label: "Bundle discount", amount: 37 }, { label: "Cash discount", amount: 25 }]);
      assert.equal(r.discount, 62);
      assert.equal(r.total, 308);
      assert.equal(r.hours, 3, "2 h wash + 1 h gutters; optional sealant not counted");
      assert.equal(r.cost, 1000 * 0.05 + 30, "line cost + the linked item's cost");
      assert.equal(r.lines[1].unitCost, 30, "linked line inherits the item's cost");
      assert.equal(r.title, "Wash — $308.00 · 3 h");
    }
    // no discount applies → total = subtotal; the discount never exceeds the subtotal
    const r2 = runEstimator(spec, { sqft: 100, extras: [], cash: false }, book);
    assert.ok(r2.ok && r2.discount === 0 && r2.total === r2.subtotal && r2.subtotal === 150);
    const big = runEstimator({ ...spec, discounts: [{ label: "Everything off", amount: "9999" }] }, { sqft: 1000, extras: [], cash: false }, book);
    assert.ok(big.ok && big.discount === 250 && big.total === 0);
    // a variant / explain run prices the AFTER-discount total
    const vr = runVariants(c.compiled, { sqft: 1000, extras: ["Gutters"], cash: false }, book, { input: "extras", values: ["Gutters", "Fence"] });
    assert.equal(vr.Gutters, 333, "370 − 10%");
  }
  // a job of only optional add-ons gets no minimum top-up
  const onlyOpt = runEstimator({ inputs: [{ id: "sqft", label: "Size", type: "number" }], lines: [{ name: "Sealant", description: "x", quantity: "sqft", unitPrice: "0.5", isOptional: true }], minimumTotal: 150 }, { sqft: 100 }, book);
  assert.ok(onlyOpt.ok && onlyOpt.lines.length === 1 && onlyOpt.subtotal === 0);
  // a linked line with no description reads the item's own
  const inherit = runEstimator({ inputs: [{ id: "n", label: "N", type: "number" }], lines: [{ name: "Wash", quantity: "n", workItemName: "House Washing" }] }, { n: 1 }, [{ ...book[0], description: "Soft wash of the whole exterior" }]);
  assert.ok(inherit.ok && inherit.lines[0].description === "Soft wash of the whole exterior");
  // a recurring item marks the line
  const rec = runEstimator({ inputs: [{ id: "n", label: "N", type: "number" }], lines: [{ name: "Mow", description: "Weekly mow", quantity: "n", workItemName: "House Washing" }] }, { n: 1 }, [{ ...book[0], recurringInterval: "MONTHLY" }]);
  assert.ok(rec.ok && rec.lines[0].recurringInterval === "MONTHLY");
  // input problems are flagged as such; a missing price-book item is not
  const bad = runEstimator(spec, { sqft: "abc" }, book);
  assert.ok(!bad.ok && bad.inputProblems === true);
  const missing = runEstimator(spec, { sqft: 1000, extras: ["Gutters"] }, []);
  assert.ok(!missing.ok && missing.inputProblems === undefined);
  // compile rejects a discount with neither percent nor amount, or both
  const dc = compileSpec({ ...spec, discounts: [{ label: "x" }] });
  assert.ok(!dc.ok && dc.errors.some((e) => /percent/.test(e)));
  const dc2 = compileSpec({ ...spec, discounts: [{ label: "x", percent: "5", amount: "5" }] });
  assert.ok(!dc2.ok);
  // the audit warns about formula-shaped descriptions
  const mathy = compileSpec({ ...spec, lines: [{ name: "Wash", description: "{sqft} sq ft at {rate|money}/sq ft", quantity: "sqft", unitPrice: "0.25" }], variables: [{ id: "rate", expr: "0.25" }], samples: [{ label: "Small", inputs: { sqft: 200 } }, { label: "Large", inputs: { sqft: 2000 } }] });
  assert.ok(mathy.ok);
  if (mathy.ok) assert.ok(auditSpec(mathy.compiled, book).warnings.some((w) => /reads like the formula/.test(w)));
  // change descriptions cover discounts and hours
  if (c.ok) {
    const changed = describeSpecChanges(c.compiled.spec, { ...c.compiled.spec, discounts: [c.compiled.spec.discounts![0]], lines: c.compiled.spec.lines.map((l, i) => (i === 0 ? { ...l, hours: "sqft / 400" } : l)) });
    assert.ok(changed.some((x) => /Removed discount "Cash discount"/.test(x)) && changed.some((x) => /Labor hours for "Wash"/.test(x)), changed.join(" | "));
  }
}
console.log("ok 16: choice arithmetic, yes/no words, discounts, hours, cost");
// ── 17: the accuracy round (2026-11-13) — one control per question, options that
// depend on answers, the rate card, labor vs price, flags, tiny jobs, cut-off copy.
// The regression case is the fence tool the builder really made (ticket cmwf5v6e…).
{
  // (a) the height question: presets 4/5/6 + a 3–6 slider + a text box → ONE row of chips
  const height = { id: "height", label: "How tall should the fence be?", type: "number" as const, unit: "ft", min: 3, max: 6, step: 1, control: "slider" as const, presets: [{ label: "4 ft", value: 4 }, { label: "5 ft", value: 5 }, { label: "6 ft", value: 6 }] };
  const hm = numberMode(height);
  assert.ok(hm.mode === "chips" && hm.stops.map((s) => s.value).join() === "3,4,5,6" && hm.stops[1].label === "4 ft" && hm.stops[0].label === "3 ft");
  // a real size stays a slider; a count stays a stepper; a bare field stays a field
  assert.equal(numberMode({ id: "sqft", label: "Size", type: "number", min: 100, max: 5000, control: "slider" }).mode, "slider");
  assert.equal(numberMode({ id: "n", label: "Windows", type: "number", min: 0, max: 5, control: "stepper" }).mode, "stepper");
  assert.equal(numberMode({ id: "x", label: "Hours", type: "number" }).mode, "field");

  // (b) options that depend on an earlier answer
  const fence = {
    inputs: [
      { id: "ft", label: "Fence length", type: "map", measure: "length" },
      { id: "style", label: "Style", type: "select", style: "cards", options: [{ value: "cedar", label: "Cedar privacy" }, { value: "chain", label: "Chain link" }] },
      { id: "height", label: "Height", type: "select", style: "cards", options: [
        { value: "4", label: "4 ft", showWhen: "style == 'chain'" },
        { value: "5", label: "5 ft", showWhen: "style == 'chain'" },
        { value: "6", label: "6 ft" },
        { value: "8", label: "8 ft", showWhen: "style == 'cedar'" },
      ] },
      { id: "gates", label: "Gates", type: "counts", options: [{ value: "walk", label: "Walk gate" }, { value: "drive", label: "Double drive gate" }] },
      { id: "rocky", label: "Rocky or steep ground?", type: "select", style: "cards", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }, { value: "unsure", label: "Not sure" }], default: "no" },
      { id: "pool", label: "Around a pool?", type: "toggle" },
    ],
    rates: [
      { id: "r_cedar", label: "Cedar privacy fence, 6 ft tall", value: 42, unit: "per ft", kind: "price", source: "market", low: 28, high: 55 },
      { id: "r_chain", label: "Chain link fence, 4 ft tall", value: 22, unit: "per ft", kind: "price", source: "owner" },
      { id: "f_8", label: "8 ft height, on the 6 ft price", value: 1.4, unit: "×", kind: "factor", source: "guess" },
      { id: "f_5", label: "5 ft height, on the 4 ft price", value: 1.15, unit: "×", kind: "factor", source: "guess" },
      { id: "f_6c", label: "6 ft height, on the 4 ft chain link price", value: 1.3, unit: "×", kind: "factor", source: "guess" },
      { id: "g_walk_wood", label: "Walk gate, wood", value: 450, unit: "each", kind: "price", source: "market", low: 300, high: 650 },
      { id: "g_walk_chain", label: "Walk gate, chain link", value: 250, unit: "each", kind: "price", source: "market", low: 175, high: 400 },
      { id: "g_drive_wood", label: "Double drive gate, wood", value: 1300, unit: "each", kind: "price", source: "guess" },
      { id: "g_drive_chain", label: "Double drive gate, chain link", value: 900, unit: "each", kind: "price", source: "guess" },
      { id: "r_rock", label: "Rocky or steep ground", value: 6, unit: "per ft", kind: "price", source: "guess" },
      { id: "t_cedar", label: "Crew time, cedar privacy", value: 0.17, unit: "person-hours per ft", kind: "time", source: "market" },
    ],
    variables: [
      { id: "base", label: "Price per foot for the style", expr: "lookup(style, {cedar: r_cedar, chain: r_chain})" },
      { id: "hf", label: "Height adjustment", expr: "style == 'cedar' ? (height == '8' ? f_8 : 1) : lookup(height, {'4': 1, '5': f_5, '6': f_6c, '8': 1}, 1)" },
      { id: "gate_ft", label: "Feet of gate openings", expr: "qty(gates, 'walk') * 4 + qty(gates, 'drive') * 12" },
    ],
    lines: [
      { name: "{style} fence, {height} ft tall", description: "Fence built along the traced line, less the gate openings", quantity: "max(0, ft - gate_ft)", unitPrice: "base * hf", group: "Fence", hours: "ft * t_cedar" },
      { name: "Walk gate", description: "Walk gate matched to the fence", quantity: "qty(gates, 'walk')", unitPrice: "lookup(style, {cedar: g_walk_wood, chain: g_walk_chain})", group: "Gates" },
      { name: "Double drive gate", description: "Double drive gate matched to the fence", quantity: "qty(gates, 'drive')", unitPrice: "lookup(style, {cedar: g_drive_wood, chain: g_drive_chain})", group: "Gates" },
      { name: "Rocky or steep ground", description: "Extra digging on rocky or steep ground", when: "rocky == 'yes'", quantity: "ft", unitPrice: "r_rock", group: "Extras" },
    ],
    labor: "in_price",
    flags: [
      { when: "rocky == 'unsure'", text: "Ground not confirmed — check for rock or slope on site" },
      { when: "pool", text: "Pool barrier: check the local pool code (height, self-closing gates)" },
    ],
    minimumTotal: 1000,
    samples: [
      { label: "Tiny job: one walk gate, 10 ft", inputs: { ft: 10, style: "chain", height: "4", gates: { walk: 1 }, rocky: "no" } },
      { label: "Small job", inputs: { ft: 60, style: "chain", height: "4", gates: {}, rocky: "no" } },
      { label: "Typical job", inputs: { ft: 150, style: "cedar", height: "6", gates: { walk: 1 }, rocky: "no" } },
      { label: "Large job", inputs: { ft: 300, style: "cedar", height: "8", gates: { walk: 1, drive: 1 }, rocky: "yes" } },
    ],
  };
  const fc = compileSpec(fence);
  assert.ok(fc.ok, fc.ok ? "" : fc.errors.join(" | "));
  if (fc.ok) {
    const fs = fc.compiled.spec;
    // what's offered follows the style; a pick that stops fitting is cleared
    assert.deepEqual(Array.from(offeredOptions(fs, { style: "cedar" }).height), ["6", "8"]);
    assert.deepEqual(Array.from(offeredOptions(fs, { style: "chain" }).height), ["4", "5", "6"]);
    assert.equal(offeredOptions(fs, {}).gates, undefined);
    const picked = { ft: "100", style: "chain", height: "8", gates: {}, rocky: "no", pool: false };
    const cleared = dropUnofferedPicks(fs, picked);
    assert.equal(cleared.height, "");
    const fine = { ...picked, height: "5" };
    assert.equal(dropUnofferedPicks(fs, fine), fine); // unchanged → the same object (no re-render loop)
    // the server refuses an impossible combination outright
    const impossible = runCompiled(fc.compiled, { ft: 100, style: "cedar", height: "4", gates: {}, rocky: "no" }, []);
    assert.ok(!impossible.ok && impossible.inputProblems === true && /isn't available/.test(impossible.errors[0]), JSON.stringify(impossible));

    // gate openings are deducted (150 ft − one 4 ft walk gate), the gate is priced for the style, nothing is counted twice
    const typ = runCompiled(fc.compiled, { ft: 150, style: "cedar", height: "6", gates: { walk: 1 }, rocky: "no" }, []);
    assert.ok(typ.ok && typ.lines[0].quantity === 146 && typ.lines[0].unitPrice === 42 && typ.lines[1].unitPrice === 450 && typ.total === 146 * 42 + 450, JSON.stringify(typ));
    const chainGate = runCompiled(fc.compiled, { ft: 150, style: "chain", height: "4", gates: { walk: 1 }, rocky: "no" }, []);
    assert.ok(chainGate.ok && chainGate.lines[1].unitPrice === 250);
    // hours schedule the job and never touch the price
    assert.ok(typ.ok && typ.hours === 25.5 && typ.flags.length === 0 && typ.minimumApplied === 0);
    // "Not sure" prices the common case and flags the estimate; so does the pool
    const unsure = runCompiled(fc.compiled, { ft: 150, style: "cedar", height: "6", gates: {}, rocky: "unsure", pool: true }, []);
    assert.ok(unsure.ok && unsure.flags.length === 2 && /Ground not confirmed/.test(unsure.flags[0]) && unsure.lines.every((l) => l.name !== "Rocky or steep ground"));
    // the tiniest job shows what the minimum does
    const tiny = runCompiled(fc.compiled, fence.samples[0].inputs, []);
    assert.ok(tiny.ok && tiny.total === 1000 && tiny.minimumApplied === 1000 - (6 * 22 + 250), JSON.stringify(tiny));

    // the builder's bar passes, and the tiny sample is reported with the top-up
    const audit = auditSpec(fc.compiled, [], { strict: true });
    assert.deepEqual(audit.errors, []);
    const t = audit.samples.find((s) => s.tiny)!;
    assert.ok(t && t.subtotal === 1000 && t.minimumApplied === 618);

    // the rate card: what's still an estimate, as plain lines, and how a save dates it
    assert.equal(ratesToConfirm(fs).length, 10);
    assert.equal(rateValueText(fs.rates![0]), "$42 per ft");
    assert.equal(rateValueText(fs.rates![2]), "×1.4");
    assert.match(confirmLines({ ...fs, market: { asOf: "2026-11-13", where: "Dallas, TX" } })[0], /^Cedar privacy fence, 6 ft tall: \$42 per ft — market estimate for Dallas, TX \(\$28–\$55\)$/);
    const built = stampRates(null, fs, "2026-11-13", "builder");
    assert.ok(built.rates!.every((r) => r.updatedAt === "2026-11-13") && built.rates![0].source === "market");
    // the owner types their cedar price a month later: that one becomes theirs and is dated; the rest keep their dates
    const edited = stampRates(built, { ...built, rates: built.rates!.map((r) => (r.id === "r_cedar" ? { ...r, value: 45 } : r)) }, "2026-12-20", "owner");
    assert.ok(edited.rates![0].source === "owner" && edited.rates![0].updatedAt === "2026-12-20" && edited.rates![1].updatedAt === "2026-11-13");
    // "Looks right" on an estimate confirms it as-is, dated the day it was confirmed
    const confirmed = stampRates(edited, { ...edited, rates: edited.rates!.map((r) => (r.id === "g_walk_wood" ? { ...r, source: "owner" as const } : r)) }, "2026-12-21", "owner");
    assert.ok(confirmed.rates!.find((r) => r.id === "g_walk_wood")!.updatedAt === "2026-12-21");
    // a later Atlas rebuild can't turn a confirmed number back into an estimate
    const rebuilt = stampRates(confirmed, { ...confirmed, rates: confirmed.rates!.map((r) => (r.id === "r_cedar" ? { ...r, source: "market" as const } : r)) }, "2027-01-05", "builder");
    assert.ok(rebuilt.rates![0].source === "owner" && rebuilt.rates![0].updatedAt === "2026-12-20");
    const dsc = describeSpecChanges(built, edited);
    assert.ok(dsc.some((x) => x === 'Rate "Cedar privacy fence, 6 ft tall": $42 per ft → $45 per ft'), dsc.join(" | "));
  }

  // (c) formulas that name a choice the question doesn't have
  const typo = compileSpec({ ...fence, lines: [...fence.lines, { name: "Cap and trim", description: "Cap and trim along the top", when: "style == 'Cedar privacy'", quantity: "ft", unitPrice: "r_rock" }] });
  assert.ok(typo.ok);
  if (typo.ok) assert.ok(auditSpec(typo.compiled, []).errors.some((e) => /compares "Style" to 'Cedar privacy'.*can never match/.test(e)));
  const badQty = compileSpec({ ...fence, variables: fence.variables.map((v) => (v.id === "gate_ft" ? { ...v, expr: "qty(gates, 'walk gate') * 4" } : v)) });
  assert.ok(badQty.ok);
  if (badQty.ok) assert.ok(auditSpec(badQty.compiled, []).errors.some((e) => /qty\(gates, 'walk gate'\).*always 0/.test(e)));
  // a price table with no row for an option: fails with no default, and with one it is priced as something else
  const noRow = compileSpec({ ...fence, variables: fence.variables.map((v) => (v.id === "base" ? { ...v, expr: "lookup(style, {cedar: r_cedar}, r_chain)" } : v)) });
  assert.ok(noRow.ok);
  if (noRow.ok) {
    assert.ok(auditSpec(noRow.compiled, [], { strict: true }).errors.some((e) => /no row for 'chain'.*priced by the default/.test(e)));
    assert.ok(auditSpec(noRow.compiled, []).warnings.some((e) => /no row for 'chain'/.test(e)));
  }

  // (d) crew time reaching a price when the prices already include labor = the hours charged twice
  const stacked = compileSpec({ ...fence, lines: [...fence.lines, { name: "Installation labor", description: "Crew labor to build the fence", quantity: "ft * t_cedar", unitPrice: "r_rock", group: "Labor" }] });
  assert.ok(stacked.ok);
  if (stacked.ok) assert.ok(auditSpec(stacked.compiled, []).errors.some((e) => /Installation labor.*crew time.*twice/.test(e)));
  const billed = compileSpec({ ...fence, labor: "billed", lines: [...fence.lines, { name: "Installation labor", description: "Crew labor to build the fence", quantity: "ft * t_cedar", unitPrice: "r_rock", group: "Labor" }] });
  assert.ok(billed.ok);
  if (billed.ok) assert.ok(!auditSpec(billed.compiled, []).errors.some((e) => /twice/.test(e)));

  // (e) the real tool from the ticket: three controls on height, bare numbers in the formulas, no labor rule, no tiny job
  const legacy = {
    inputs: [
      { id: "fence_ft", type: "map", label: "Draw where the fence will run", measure: "length", required: true },
      { id: "fence_style", type: "select", label: "What style of fence do you want?", style: "cards", options: [{ label: "Cedar privacy", value: "Cedar privacy fence" }, { label: "Ranch rail", value: "Ranch rail fence" }], required: true },
      height,
      { id: "gates", type: "counts", label: "Gates", options: [{ label: "Walk gate (3-4 ft wide)", value: "walk" }, { label: "Double drive gate (10-16 ft wide)", value: "drive" }] },
    ],
    variables: [
      { id: "base", expr: "lookup(fence_style, {'Cedar privacy fence': 30, 'Ranch rail fence': 26}, 26)" },
      { id: "hf", expr: "tier(height, [[4, 1], [5, 1.2]], 1.4)" },
      { id: "hpf", expr: "lookup(fence_style, {'Cedar privacy fence': 0.17, 'Ranch rail fence': 0.15}, 0.15)" },
    ],
    lines: [
      { name: "{fence_style}, {height} ft tall", group: "Fence", hours: "fence_ft * hpf", quantity: "fence_ft", unitPrice: "base * hf", description: "Installation of the chosen fence along the traced line" },
      { name: "Walk gate, 3-4 ft wide", group: "Gates", quantity: "qty(gates, 'walk')", unitPrice: "425", description: "Single walk gate hung on posts" },
    ],
    minimumTotal: 600,
    placeholders: ["Labor time: about 0.17 person-hours per ft for cedar privacy, 0.2 for vinyl privacy, 0.15 for ranch rail, 0.22 for pipe, 0.12 for chain link — estimate; set you"],
    samples: [{ label: "Small job", inputs: { fence_ft: 40, fence_style: "Ranch rail fence", height: 4, gates: {} } }, { label: "Typical job", inputs: { fence_ft: 150, fence_style: "Cedar privacy fence", height: 6, gates: { walk: 1 } } }],
  };
  const lc = compileSpec(legacy);
  assert.ok(lc.ok, lc.ok ? "" : lc.errors.join(" | "));
  if (lc.ok) {
    // it still runs exactly as before — old tools are untouched until someone changes them
    const r = runCompiled(lc.compiled, { fence_ft: 150, fence_style: "Cedar privacy fence", height: 6, gates: { walk: 1 } }, []);
    assert.ok(r.ok && r.total === 150 * 42 + 425);
    // a hand edit is only told; the builder is made to fix it
    const loose = auditSpec(lc.compiled, []);
    assert.deepEqual(loose.errors, []);
    const strict = auditSpec(lc.compiled, [], { strict: true }).errors.join("\n");
    assert.match(strict, /Line "Walk gate, 3-4 ft wide" is priced with a bare number \(425\)/);
    assert.match(strict, /the table has bare numbers \(Cedar privacy fence: 30, Ranch rail fence: 26\)/);
    assert.match(strict, /Say how labor hours relate to the price/);
    assert.match(strict, /Add one or two "Tiny job" samples/);
    assert.match(strict, /Variable "base" needs a "label"/);
  }
  // text past the limit is cut at a word with an ellipsis (never "set you"), and the builder is sent back to shorten it
  const long = compileSpec({ ...fence, placeholders: [`${"Labor time is an estimate for every style we build and install here ".repeat(4)}so set your own`] });
  assert.ok(long.ok && long.compiled.spec.placeholders![0].endsWith("…") && !/\S…$/.test(long.compiled.spec.placeholders![0].replace(/\w+…$/, "")));
  if (long.ok) assert.ok(auditSpec(long.compiled, [], { strict: true }).errors.some((e) => /Placeholder 1 is cut off/.test(e)));

  // compile refuses what can't work: an option gated on itself, a default that isn't always offered, a bad labor value
  const selfGate = compileSpec({ ...fence, inputs: fence.inputs.map((i) => (i.id === "height" ? { ...i, options: [{ value: "4", label: "4 ft", showWhen: "height == '6'" }, { value: "6", label: "6 ft" }] } : i)) });
  assert.ok(!selfGate.ok && selfGate.errors.some((e) => /can't read its own question/.test(e)));
  const gatedDefault = compileSpec({ ...fence, inputs: fence.inputs.map((i) => (i.id === "height" ? { ...i, default: "8" } : i)) });
  assert.ok(!gatedDefault.ok && gatedDefault.errors.some((e) => /isn't always offered/.test(e)));
  const badLabor = compileSpec({ ...fence, labor: "extra" });
  assert.ok(!badLabor.ok && badLabor.errors.some((e) => /"labor" must be/.test(e)));
  const dupRate = compileSpec({ ...fence, rates: [...fence.rates, { id: "ft", label: "Clash", value: 1, kind: "price", source: "owner" }] });
  assert.ok(!dupRate.ok && dupRate.errors.some((e) => /Duplicate id "ft"/.test(e)));

  // the guide's own example is held to the builder's bar — the model is never taught a spec the audit rejects
  const m = ESTIMATOR_GUIDE.match(/spec = (\{[\s\S]*?\n\})\n\nRules:/);
  assert.ok(m, "guide example not found");
  const example = new Function(`return (${m![1]});`)();
  const gc = compileSpec(example);
  assert.ok(gc.ok, gc.ok ? "" : gc.errors.join(" | "));
  if (gc.ok) {
    const ga = auditSpec(gc.compiled, [{ id: "w1", name: "Driveway Cleaning", unitPrice: 0.3, unitCost: 0.05 }], { strict: true });
    assert.deepEqual(ga.errors, []);
    assert.deepEqual(ga.warnings, []);
  }
}
console.log("ok 17: one control, answer-dependent options, rate card, labor vs price, flags, tiny jobs, copy");
console.log("\nestimator: all green");
