/**
 * The corrections scorecard (lib/estimator-corrections.ts): simulated owners
 * who edit the quotes a fence tool produces, and what the app must — and
 * must NOT — offer them. Most cases are traps: the right answer is silence.
 * Pure — no DB, no network, no model.
 * Run: npx tsx scripts/test-estimator-corrections.ts
 */
import assert from "node:assert";
import { runEstimator, type EstimatorSpec, type PriceBookEntry } from "../lib/estimator";
import { analyzeCorrections, applySuggestion, builderRequest, isRounding, niceNumber, suggestionText, type CorrectionLine, type Dismissal, type Observation, type Suggestion } from "../lib/estimator-corrections";

const SPEC: EstimatorSpec = {
  version: 1,
  inputs: [
    { id: "length", label: "Fence length", type: "number", unit: "ft", min: 1, required: true },
    {
      id: "material",
      label: "Material",
      type: "select",
      options: [
        { value: "cedar", label: "Cedar" },
        { value: "vinyl", label: "Vinyl" },
      ],
      default: "cedar",
    },
    { id: "tall", label: "8 ft tall", type: "toggle" },
    { id: "gates", label: "Gates", type: "number", min: 0, default: 0 },
    { id: "tearout", label: "Remove the old fence", type: "toggle" },
  ],
  rates: [
    { id: "cedar_ft", label: "Cedar fence", value: 31, unit: "per ft", kind: "price", source: "owner" },
    { id: "vinyl_ft", label: "Vinyl fence", value: 42, unit: "per ft", kind: "price", source: "owner" },
    { id: "tall_factor", label: "8 ft height", value: 1.25, unit: "×", kind: "factor", source: "owner" },
    { id: "gate_each", label: "Gate", value: 350, unit: "each", kind: "price", source: "owner" },
    { id: "tearout_ft", label: "Old fence removal", value: 4, unit: "per ft", kind: "price", source: "owner" },
    { id: "permit_fee", label: "Permit handling", value: 75, unit: "flat", kind: "price", source: "owner" },
  ],
  variables: [{ id: "per_ft", expr: "lookup(material, {cedar: cedar_ft, vinyl: vinyl_ft}, cedar_ft) * (tall ? tall_factor : 1)" }],
  lines: [
    { id: "fence", name: "Fence installation", quantity: "length", unitPrice: "per_ft" },
    { id: "gates", name: "Gates", when: "gates > 0", quantity: "gates", unitPrice: "gate_each" },
    { id: "tearout", name: "Old fence removal", when: "tearout", quantity: "length", unitPrice: "tearout_ft" },
    { id: "permit", name: "Permit handling", quantity: "1", unitPrice: "permit_fee" },
  ],
  minimumTotal: 900,
};

type Job = { length: number; material?: "cedar" | "vinyl"; tall?: boolean; gates?: number; tearout?: boolean; caps?: number };

/** The same tool with one line sold straight from the price book (no rate on the card). */
const BOOK: PriceBookEntry[] = [
  { id: "wi_caps", name: "Post caps", unitPrice: 12, unitCost: 5 },
  { id: "wi_other", name: "Stain", unitPrice: 300, unitCost: null },
];
const SPEC_BOOK: EstimatorSpec = {
  ...SPEC,
  inputs: [...SPEC.inputs, { id: "caps", label: "Post caps", type: "number", min: 0, default: 0 }],
  lines: [...SPEC.lines, { id: "caps", name: "Post caps", when: "caps > 0", quantity: "caps", workItemName: "Post caps" }],
};
type Edit = (lines: CorrectionLine[], job: Job, i: number) => CorrectionLine[];

const NOW = new Date("2026-11-17T12:00:00Z");
let seq = 0;

function toolLines(spec: EstimatorSpec, job: Job, book: PriceBookEntry[] = []): CorrectionLine[] {
  const run = runEstimator(spec, { material: "cedar", tall: false, gates: 0, tearout: false, ...job }, book);
  assert.ok(run.ok, `the test spec must run: ${run.ok ? "" : run.errors.join("; ")}`);
  return run.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, isOptional: l.isOptional }));
}

/** Quotes, oldest first, one a day ending yesterday. `edit` is what the owner did before sending. */
function quotes(jobs: Job[], edit: Edit, opts: { spec?: EstimatorSpec; book?: PriceBookEntry[]; outcome?: (i: number) => Observation["outcome"] } = {}): Observation[] {
  return jobs.map((job, i) => {
    const tool = toolLines(opts.spec ?? SPEC, job, opts.book);
    return {
      id: `q${++seq}`,
      quoteNumber: 100 + seq,
      at: new Date(NOW.getTime() - (jobs.length - i) * 86_400_000).toISOString(),
      inputs: { material: "cedar", tall: false, gates: 0, tearout: false, ...job },
      toolLines: tool,
      sentLines: edit(
        tool.map((l) => ({ ...l })),
        job,
        i
      ),
      outcome: opts.outcome?.(i) ?? "open",
    };
  });
}

const keep: Edit = (l) => l;
const price = (name: string, f: (p: number, l: CorrectionLine) => number): Edit => (lines) => lines.map((l) => (l.name === name ? { ...l, unitPrice: Math.round(f(l.unitPrice, l) * 100) / 100 } : l));
const only = (when: (job: Job, i: number) => boolean, edit: Edit): Edit => (lines, job, i) => (when(job, i) ? edit(lines, job, i) : lines);
const then = (...edits: Edit[]): Edit => (lines, job, i) => edits.reduce((ls, e) => e(ls, job, i), lines);
const total = (lines: CorrectionLine[]) => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
/** Round the quote's total to a step by nudging the fence line — what owners do. */
const roundTotal = (step: number): Edit => (lines) => {
  const want = Math.round(total(lines) / step) * step;
  const i = lines.findIndex((l) => l.name === "Fence installation");
  const rest = total(lines) - lines[i].quantity * lines[i].unitPrice;
  return lines.map((l, j) => (j === i ? { ...l, unitPrice: (want - rest) / l.quantity } : l));
};

const JOBS: Job[] = [{ length: 142 }, { length: 96, gates: 1 }, { length: 210, gates: 2 }, { length: 75 }, { length: 180, tearout: true }, { length: 118, gates: 1 }];

type Case = { name: string; obs: Observation[]; spec?: EstimatorSpec; book?: PriceBookEntry[]; dismissed?: Dismissal[]; expect: string[]; check?: (s: Suggestion[]) => void };
const CAP_JOBS: Job[] = [{ length: 142, caps: 18 }, { length: 96, caps: 12 }, { length: 210 }, { length: 75, caps: 10 }, { length: 180, caps: 23 }];
/** What Atlas does to a quote: files lines under other names, prices untouched. */
const renamed: Edit = (lines) => lines.map((l) => ({ ...l, name: l.name === "Gates" ? "Gate install" : l.name === "Permit handling" ? "Permit" : l.name }));
const rate = (s: Suggestion[], id: string) => s.find((x): x is Extract<Suggestion, { kind: "rate" }> => x.kind === "rate" && x.rateId === id)!;

const cedar34 = price("Fence installation", () => 34);
const base34 = quotes(JOBS, cedar34);

const cases: Case[] = [
  // ── real patterns: must be offered, with the right number ──
  { name: "cedar $31 → $34 on every quote", obs: base34, expect: ["rate:cedar_ft:up"], check: (s) => assert.equal(rate(s, "cedar_ft").to, 34) },
  {
    name: "raised to $34 AND the total rounded to $25",
    obs: quotes(JOBS, then(cedar34, roundTotal(25))),
    expect: ["rate:cedar_ft:up"],
    check: (s) => assert.equal(rate(s, "cedar_ft").to, 34),
  },
  {
    name: "prices went up recently: five old quotes untouched, the last three at $34",
    obs: quotes([...JOBS, { length: 130 }, { length: 88 }], only((_, i) => i >= 5, cedar34)),
    expect: ["rate:cedar_ft:up"],
    check: (s) => assert.equal(rate(s, "cedar_ft").to, 34),
  },
  {
    name: "four of the last five at $34",
    obs: quotes(JOBS.slice(0, 5), only((_, i) => i !== 1, cedar34)),
    expect: ["rate:cedar_ft:up"],
  },
  {
    name: "only tall fences edited (×1.25 → ×1.4): the height factor, not the cedar price",
    obs: quotes(
      [{ length: 142, tall: true }, { length: 96 }, { length: 210, tall: true }, { length: 75 }, { length: 180, tall: true }, { length: 118, tall: true }],
      only((j) => Boolean(j.tall), price("Fence installation", () => 31 * 1.4))
    ),
    expect: ["rate:tall_factor:up"],
    check: (s) => assert.equal(rate(s, "tall_factor").to, 1.4),
  },
  {
    name: "only vinyl edited ($42 → $46)",
    obs: quotes(
      [{ length: 142, material: "vinyl" }, { length: 96 }, { length: 210, material: "vinyl" }, { length: 75 }, { length: 180, material: "vinyl" }, { length: 60, material: "vinyl" }],
      only((j) => j.material === "vinyl", price("Fence installation", () => 46))
    ),
    expect: ["rate:vinyl_ft:up"],
    check: (s) => assert.equal(rate(s, "vinyl_ft").to, 46),
  },
  { name: "gates $350 → $400", obs: quotes([{ length: 96, gates: 1 }, { length: 210, gates: 2 }, { length: 118, gates: 1 }, { length: 75 }, { length: 150, gates: 3 }], price("Gates", () => 400)), expect: ["rate:gate_each:up"], check: (s) => assert.equal(rate(s, "gate_each").to, 400) },
  { name: "a price cut: cedar $31 → $28.50", obs: quotes(JOBS, price("Fence installation", () => 28.5)), expect: ["rate:cedar_ft:down"], check: (s) => assert.equal(rate(s, "cedar_ft").to, 28.5) },
  {
    name: "the line renamed and repriced",
    obs: quotes(JOBS, (lines) => lines.map((l) => (l.name === "Fence installation" ? { ...l, name: "Cedar privacy fence, installed", unitPrice: 34 } : l))),
    expect: ["rate:cedar_ft:up"],
  },
  {
    name: "half-foot lengths (the tool folds 142.5 ft into one line at the full price) with the price raised",
    obs: quotes([{ length: 142.5 }, { length: 96.5 }, { length: 210.5 }, { length: 75.5 }], (lines, job) => lines.map((l) => (l.name === "Fence installation" ? { ...l, unitPrice: 34 * job.length } : l))),
    expect: ["rate:cedar_ft:up"],
    check: (s) => assert.equal(rate(s, "cedar_ft").to, 34),
  },
  {
    name: "small jobs always go out at $1,500",
    obs: quotes([{ length: 30 }, { length: 142 }, { length: 36 }, { length: 41 }, { length: 180 }, { length: 33 }], only((j) => j.length < 45, (lines) => roundTotalTo(lines, 1500))),
    expect: ["minimum:up"],
    check: (s) => assert.equal(s.find((x) => x.kind === "minimum" && x.to === 1500) != null, true),
  },
  {
    name: "a haul-away line typed onto four of six quotes",
    obs: quotes(JOBS, only((_, i) => i !== 1 && i !== 4, (lines, _j, i) => [...lines, { name: i % 2 ? "Haul away" : "Haul-away (1 load)", quantity: 1, unitPrice: 150 }])),
    expect: ["add:haul away"],
    check: (s) => assert.match(builderRequest(s[0]) ?? "", /Haul/),
  },
  {
    name: "the permit line taken off four of the last five",
    obs: quotes(JOBS.slice(0, 5), only((_, i) => i !== 0, (lines) => lines.filter((l) => l.name !== "Permit handling"))),
    expect: ["drop:permit handling"],
  },
  {
    name: "a price-book line ($12 post caps sent at $15): the price book, not the tool",
    obs: quotes(CAP_JOBS, price("Post caps", () => 15), { spec: SPEC_BOOK, book: BOOK }),
    spec: SPEC_BOOK,
    book: BOOK,
    expect: ["book:wi_caps:up"],
    check: (s) => assert.ok(s[0].kind === "price_book" && s[0].to === 15 && s[0].workItemId === "wi_caps"),
  },
  {
    name: "an Atlas-made quote: lines under other names, and cedar raised to $34",
    obs: quotes(JOBS, then(renamed, cedar34)),
    expect: ["rate:cedar_ft:up"],
    check: (s) => assert.equal(rate(s, "cedar_ft").to, 34),
  },
  // ── traps: the right answer is nothing ──
  { name: "TRAP an Atlas-made quote: lines under other names, nothing repriced", obs: quotes(JOBS, renamed), expect: [] },
  { name: "TRAP a price-book line repriced once", obs: quotes(CAP_JOBS, only((_, i) => i === 1, price("Post caps", () => 15)), { spec: SPEC_BOOK, book: BOOK }), spec: SPEC_BOOK, book: BOOK, expect: [] },
  { name: "TRAP nothing edited", obs: quotes(JOBS, keep), expect: [] },
  { name: "TRAP totals rounded to the nearest $50", obs: quotes(JOBS, roundTotal(50)), expect: [] },
  { name: "TRAP totals rounded to the nearest $100", obs: quotes([{ length: 142 }, { length: 196, gates: 1 }, { length: 210, gates: 2 }, { length: 175 }, { length: 180, tearout: true }], roundTotal(100)), expect: [] },
  { name: "TRAP one big favour to a friend", obs: quotes(JOBS, only((_, i) => i === 3, price("Fence installation", (p) => p * 0.8))), expect: [] },
  { name: "TRAP two edits (not enough)", obs: quotes(JOBS.slice(0, 2), cedar34), expect: [] },
  { name: "TRAP edits go both ways", obs: quotes(JOBS, price("Fence installation", (p, l) => (l.quantity > 120 ? p * 1.1 : p * 0.9))), expect: [] },
  { name: "TRAP all up, by wildly different amounts (hard jobs, not a new rate)", obs: quotes(JOBS, (lines, _j, i) => price("Fence installation", (p) => p * [1.05, 1.3, 1.12, 1.45, 1.08, 1.22][i])(lines, _j, i)), expect: [] },
  { name: "TRAP three of five edited, mixed in with untouched ones", obs: quotes(JOBS.slice(0, 5), only((_, i) => i === 0 || i === 2 || i === 3, cedar34)), expect: [] },
  { name: "TRAP the footage corrected, the price left alone", obs: quotes(JOBS, (lines) => lines.map((l) => (l.name === "Fence installation" ? { ...l, quantity: l.quantity + 12 } : l))), expect: [] },
  { name: "TRAP half-foot lengths, nothing edited", obs: quotes([{ length: 142.5 }, { length: 96.5 }, { length: 210.5 }, { length: 75.5 }], keep), expect: [] },
  { name: "TRAP a tiny nudge (1%)", obs: quotes(JOBS, price("Fence installation", (p) => p * 1.01)), expect: [] },
  { name: "TRAP a haul-away line typed twice", obs: quotes(JOBS, only((_, i) => i === 2 || i === 5, (lines) => [...lines, { name: "Haul away", quantity: 1, unitPrice: 150 }])), expect: [] },
  { name: "TRAP the permit line taken off once", obs: quotes(JOBS, only((_, i) => i === 4, (lines) => lines.filter((l) => l.name !== "Permit handling"))), expect: [] },
  { name: "TRAP raised, and every decided quote was lost", obs: quotes(JOBS, cedar34, { outcome: (i) => (i < 3 ? "lost" : "open") }), expect: [] },
  { name: "TRAP the owner already said never", obs: base34, dismissed: [{ key: "rate:cedar_ft:up", mode: "never", seen: [] }], expect: [] },
  { name: "TRAP said not now, two new quotes since", obs: base34, dismissed: [{ key: "rate:cedar_ft:up", mode: "later", seen: base34.slice(0, 4).map((o) => o.id) }], expect: [] },
  {
    name: "TRAP the rate was already changed to $34 (old quotes say $31)",
    obs: base34,
    spec: { ...SPEC, rates: SPEC.rates!.map((r) => (r.id === "cedar_ft" ? { ...r, value: 34 } : r)) },
    expect: [],
  },
  {
    name: "TRAP the tool was rebuilt since (its lines are named differently now)",
    obs: base34,
    spec: { ...SPEC, lines: SPEC.lines.map((l) => (l.id === "fence" ? { ...l, name: "Fence, installed" } : l)) },
    expect: [],
  },
  { name: "TRAP quotes older than six months", obs: base34.map((o) => ({ ...o, at: "2026-03-01T12:00:00.000Z" })), expect: [] },
  // ── and it comes back when it should ──
  { name: "said not now, three new quotes since", obs: base34, dismissed: [{ key: "rate:cedar_ft:up", mode: "later", seen: base34.slice(0, 3).map((o) => o.id) }], expect: ["rate:cedar_ft:up"] },
];

function roundTotalTo(lines: CorrectionLine[], want: number): CorrectionLine[] {
  const i = lines.findIndex((l) => l.name === "Fence installation");
  const rest = total(lines) - lines[i].quantity * lines[i].unitPrice;
  return lines.map((l, j) => (j === i ? { ...l, unitPrice: Math.round(((want - rest) / l.quantity) * 100) / 100 } : l));
}

// helpers first
assert.equal(isRounding(4402, 4400), true);
assert.equal(isRounding(4402, 4450), true);
assert.equal(isRounding(4402, 4828), false);
assert.equal(isRounding(310, 400), false, "a 29% jump is not rounding");
assert.equal(isRounding(3100, 3200), false, "a full step is a price change");
assert.equal(niceNumber(33.87), 34);
assert.equal(niceNumber(1.398), 1.4);
assert.equal(niceNumber(0.183), 0.183);
assert.equal(niceNumber(1497), 1500);

let wrong = 0;
let silentRight = 0;
let silentAll = 0;
for (const c of cases) {
  const report = analyzeCorrections(c.spec ?? SPEC, c.book ?? [], c.obs, { dismissed: c.dismissed, now: NOW });
  const got = report.suggestions.map((s) => s.key).sort();
  const want = [...c.expect].sort();
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (c.expect.length === 0) {
    silentAll++;
    if (ok) silentRight++;
  }
  if (!ok) {
    wrong++;
    console.error(`✗ ${c.name}\n    wanted ${JSON.stringify(want)}\n    got    ${JSON.stringify(got)}\n    held   ${JSON.stringify(report.held)} usable ${report.usable} stale ${report.stale}`);
    continue;
  }
  try {
    c.check?.(report.suggestions);
    // every offered change must read as words and apply (or hand off) cleanly
    for (const s of report.suggestions) {
      const t = suggestionText(s);
      assert.ok(t.title && t.detail && t.action);
      const applied = applySuggestion(SPEC, s);
      assert.ok(applied || builderRequest(s) || s.kind === "price_book", "a suggestion must be appliable, have a builder request, or be a price-book change");
      // the proof holds: applying it leaves nothing more to offer for the same thing
      if (applied) assert.ok(!analyzeCorrections(applied, [], c.obs, { now: NOW }).suggestions.some((x) => x.key === s.key), "after the change, the same suggestion must not come back");
    }
    console.log(`✓ ${c.name}`);
  } catch (e) {
    wrong++;
    console.error(`✗ ${c.name}: ${(e as Error).message}`);
  }
}

console.log(`\n${cases.length - wrong}/${cases.length} cases right; stayed quiet on ${silentRight}/${silentAll} traps`);
assert.equal(wrong, 0, "corrections scorecard has failures");
