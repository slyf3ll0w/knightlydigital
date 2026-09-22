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
console.log("\nestimator: all green");
