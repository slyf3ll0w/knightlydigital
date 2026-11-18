/**
 * Per-company corrections for estimate tools
 * (docs/plans/estimator-corrections-2026-11-17.md).
 *
 * When a quote that came from a tool goes out, the app keeps the answers the
 * tool was given, the lines it produced and the lines the owner sent
 * (EstimatorQuoteRun). This file reads those and decides whether the owner's
 * edits add up to a change worth offering — "you charge $34 a foot where the
 * tool says $31".
 *
 * The rule that keeps the suggestions honest: nothing is offered unless it is
 * PROVEN on the owner's own quotes. A candidate change is applied to a copy
 * of the tool, every recent job is priced again from its saved answers, and
 * the change is offered only when it reproduces what the owner actually
 * charged. No model is involved; it is arithmetic, so it is free, repeatable
 * and scored exactly (scripts/test-estimator-corrections.ts).
 *
 * What is deliberately NOT a correction:
 *   - rounding ($4,402 sent as $4,400) — never a RATE change; when it is what
 *     they do on nearly every quote it is offered as rounding itself
 *   - a changed quantity at the same unit price (the measurement was off, not the rate)
 *   - the quote's discount field (a favour to one client)
 *   - edits that go both ways, or agree with each other by less than 5%
 *   - anything seen fewer than three times
 *   - jobs the tool no longer prices the same way (its questions or lines changed since)
 *
 * Pure: no database, no network.
 */
import { compileSpec, runCompiled, ROUND_STEPS, type CompiledSpec, type EstimatorRate, type EstimatorSpec, type PriceBookEntry } from "./estimator";

// ── what goes in ─────────────────────────────────────────────────────────────

export type CorrectionLine = { name: string; quantity: number; unitPrice: number; isOptional?: boolean };

/** One quote that came from the tool and went out. */
export type Observation = {
  id: string;
  quoteNumber?: number;
  /** ISO time the quote went out. */
  at: string;
  /** The answers the tool was given. */
  inputs: Record<string, unknown>;
  /** The lines the tool produced at the time. */
  toolLines: CorrectionLine[];
  /** The lines the owner sent. */
  sentLines: CorrectionLine[];
  /** The discount on the quote that went out, in dollars (0 or absent = none). Only rounding reads it. */
  sentDiscount?: number;
  outcome: "won" | "lost" | "open";
};

/** A suggestion the owner already answered. */
export type Dismissal = {
  key: string;
  /** "never" = don't offer this again; "later" = only with three more quotes behind it. */
  mode: "never" | "later";
  /** The quotes that were behind the suggestion when it was dismissed. */
  seen: string[];
};

// ── what comes out ───────────────────────────────────────────────────────────

export type EvidenceQuote = {
  id: string;
  quoteNumber?: number;
  at: string;
  /** What the tool said for the part in question. */
  tool: number;
  /** What the owner sent for it. */
  sent: number;
  outcome: Observation["outcome"];
};

export type Proof = {
  /** Recent quotes the suggestion was checked against. */
  checked: number;
  /** How many of them the tool prices the owner's way today. */
  matchBefore: number;
  /** How many it would price the owner's way with the change. */
  matchAfter: number;
};

type SuggestionBase = { key: string; quotes: EvidenceQuote[]; proof: Proof };

export type Suggestion =
  | (SuggestionBase & { kind: "rate"; rateId: string; label: string; unit?: string; rateKind: EstimatorRate["kind"]; from: number; to: number })
  /** A line priced straight from the price book: the change is to the price-book item, not the tool. */
  | (SuggestionBase & { kind: "price_book"; workItemId: string; name: string; from: number; to: number })
  | (SuggestionBase & { kind: "add_line"; name: string; typical: number; low: number; high: number })
  | (SuggestionBase & { kind: "drop_line"; name: string })
  | (SuggestionBase & { kind: "minimum"; from: number | null; to: number })
  /** They round every price by hand: the tool can do it (spec.roundTo). */
  | (SuggestionBase & { kind: "rounding"; to: number; mode: "nearest" | "up" });

/** Why a pattern that looked like something was NOT offered — for the scorecard and for debugging. */
export type Held = { key: string; reason: "few" | "mixed" | "both_ways" | "scattered" | "tiny" | "unproven" | "not_winning" | "dismissed" | "overlap" };

export type CorrectionReport = {
  /** Best first. */
  suggestions: Suggestion[];
  held: Held[];
  /** Quotes that could be read against today's tool. */
  usable: number;
  /** Quotes skipped because the tool has changed too much since. */
  stale: number;
};

// ── the bar (one place, so the scorecard and the app agree) ──────────────────

export const CORRECTION_BAR = {
  /** Fewest quotes behind any suggestion. */
  minQuotes: 3,
  /** Recent quotes looked at for "is this what they usually do". */
  window: 5,
  /** Share of that window that must carry the edit (or the last three in a row). */
  share: 0.75,
  /** The edits must agree with each other this closely (highest vs lowest implied number). */
  spread: 0.05,
  /** A change smaller than this is not worth the owner's attention. */
  minChange: 0.02,
  /** "Priced the owner's way" = within this of what they sent (the estimator standard's 2%). */
  match: 0.02,
  /** A dismissed "not now" comes back only with this many new quotes behind it. */
  newQuotesToReturn: 3,
  /** Only quotes this recent count. */
  maxAgeDays: 180,
  /** And only this many of them. */
  maxQuotes: 40,
} as const;

// ── small helpers ────────────────────────────────────────────────────────────

const cents = (n: number) => Math.round(n * 100) / 100;
const amount = (l: CorrectionLine) => cents(l.quantity * l.unitPrice);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Name with the numbers taken out — "Haul-away (2 loads)" and "Haul away" are the same thing. */
const kind = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/s\b/g, "");
/** Every word of `a` is in `b`. */
const within = (a: string, b: string) => {
  const words = new Set(b.split(" "));
  return a.split(" ").every((w) => words.has(w));
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Is `sent` just `tool` rounded? True when the sent figure sits on a round
 * step ($5 … $100), is less than one step away, and moved by 3% or less.
 */
export function isRounding(tool: number, sent: number): boolean {
  const d = Math.abs(sent - tool);
  if (d < 0.005) return true;
  if (tool <= 0 || d / tool > 0.03) return false;
  const c = Math.round(sent * 100);
  for (const step of [100, 50, 25, 10, 5]) if (c % (step * 100) === 0) return d < step;
  return false;
}

/** Same price, as far as an owner is concerned: a dollar, half a percent, or rounding. */
function same(tool: number, sent: number): boolean {
  const d = Math.abs(sent - tool);
  return d <= Math.max(1, Math.abs(tool) * 0.005) || isRounding(tool, sent);
}

/** Priced the owner's way (the standard's 2%, a dollar, or rounding). */
function matches(tool: number, sent: number): boolean {
  const d = Math.abs(sent - tool);
  return d <= Math.max(1, Math.abs(sent) * CORRECTION_BAR.match) || isRounding(tool, sent);
}

/**
 * The plainest number within 1% of `v` — an owner prices at $34, not $33.87.
 */
export function niceNumber(v: number): number {
  const a = Math.abs(v);
  const steps = a >= 1000 ? [100, 50, 25, 10, 5, 1] : a >= 100 ? [25, 10, 5, 1] : a >= 10 ? [5, 1, 0.5, 0.25] : a >= 1 ? [0.5, 0.25, 0.1, 0.05, 0.01] : [0.05, 0.01, 0.005, 0.001];
  for (const step of steps) {
    const r = Math.round(v / step) * step;
    if (r !== 0 && Math.abs(r - v) / a <= 0.01) return Number(r.toFixed(4));
  }
  return Number(v.toFixed(a >= 1 ? 2 : 4));
}

// ── reading one quote against today's tool ───────────────────────────────────

type Keyed = { key: string; name: string; line: CorrectionLine };

/** Lines keyed by name, with a counter for repeats ("Gate" twice → gate#0, gate#1). */
function keyed(lines: CorrectionLine[]): Keyed[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const n = norm(line.name);
    const i = seen.get(n) ?? 0;
    seen.set(n, i + 1);
    return { key: `${n}#${i}`, name: line.name, line };
  });
}

type Pair = {
  key: string;
  name: string;
  /** Today's tool, for the same answers. */
  tool: number;
  /** What was sent, at the TOOL's quantity — a changed quantity is a measurement, not a price. */
  sent: number;
  optional: boolean;
};

type Read = {
  obs: Observation;
  pairs: Pair[];
  /** Lines the owner typed in by hand. */
  added: CorrectionLine[];
  /** Tool lines the owner took off. */
  removed: Keyed[];
  /** The tool topped this job up to its minimum. */
  atMinimum: boolean;
  toolTotal: number;
  sentTotal: number;
  /** The price the client sees: the totals above less the discount (the tool's own rules; the quote's own field). Rounding lands here. */
  toolNet: number;
  sentNet: number;
};

function linesOf(compiled: CompiledSpec, inputs: Record<string, unknown>, book: PriceBookEntry[]): { lines: CorrectionLine[]; minimumApplied: number; discount: number } | null {
  const run = runCompiled(compiled, inputs, book);
  if (!run.ok) return null;
  return { lines: run.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, isOptional: l.isOptional })), minimumApplied: run.minimumApplied, discount: run.discount };
}

/**
 * One quote read against today's tool, or null when the tool no longer asks
 * the same things or builds the same lines for this job (its evidence is
 * about an older tool).
 */
function read(compiled: CompiledSpec, book: PriceBookEntry[], obs: Observation): Read | null {
  const now = linesOf(compiled, obs.inputs, book);
  if (!now) return null;
  const tool = keyed(now.lines);
  const then = keyed(obs.toolLines);
  if (tool.length !== then.length || tool.some((t, i) => t.key !== then[i].key)) return null;

  const sent = keyed(obs.sentLines);
  const sentByKey = new Map(sent.map((s) => [s.key, s] as const));
  const pairs: Pair[] = [];
  let removed: Keyed[] = [];
  const used = new Set<string>();
  for (const t of tool) {
    const s = sentByKey.get(t.key);
    if (!s) {
      removed.push(t);
      continue;
    }
    used.add(t.key);
    pairs.push(pair(t, s.line));
  }
  let added = sent.filter((s) => !used.has(s.key)).map((s) => s.line);
  // a line off and a line on with the same quantity and price = the same line under another name
  // (Atlas files a line under its price-book name; an owner retitles one)
  for (const t of [...removed]) {
    const i = added.findIndex((s) => Math.abs(s.quantity - t.line.quantity) < 0.001 && Math.abs(s.unitPrice - t.line.unitPrice) < 0.005);
    if (i < 0) continue;
    pairs.push(pair(t, added[i]));
    removed = removed.filter((x) => x !== t);
    added.splice(i, 1);
  }
  // one line off and one line on = the owner renamed it and repriced it; read it as the same line
  if (removed.length === 1 && added.length === 1) {
    pairs.push(pair(removed[0], added[0]));
    removed = [];
    added = [];
  }
  const owed = (ls: { optional: boolean; amt: number }[]) => cents(ls.filter((l) => !l.optional).reduce((s, l) => s + l.amt, 0));
  const toolTotal = owed(tool.map((t) => ({ optional: Boolean(t.line.isOptional), amt: amount(t.line) })));
  const sentTotal = owed(obs.sentLines.map((l) => ({ optional: Boolean(l.isOptional), amt: amount(l) })));
  return {
    obs,
    pairs,
    added: added.filter((l) => amount(l) > 0),
    removed,
    atMinimum: now.minimumApplied > 0,
    toolTotal,
    sentTotal,
    toolNet: cents(toolTotal - now.discount),
    sentNet: cents(sentTotal - Math.max(0, obs.sentDiscount ?? 0)),
  };
}

function pair(t: Keyed, s: CorrectionLine): Pair {
  const sameQty = Math.abs(s.quantity - t.line.quantity) < 0.001;
  return {
    key: t.key,
    name: t.name,
    tool: amount(t.line),
    sent: sameQty ? amount(s) : cents(s.unitPrice * t.line.quantity),
    optional: Boolean(t.line.isOptional),
  };
}

// ── "is this what they usually do?" ──────────────────────────────────────────

/**
 * The quotes behind a pattern, or null. `flags` is oldest → newest, true where
 * the quote carries the edit. Passes when at least three of the last five
 * carry it AND that is three quarters of them — or the last three in a row do
 * (prices went up recently). Returns the indexes that count as evidence.
 */
function usual(flags: boolean[]): number[] | null {
  const B = CORRECTION_BAR;
  const n = flags.length;
  if (n < B.minQuotes) return null;
  // the unbroken run at the end
  let run = 0;
  while (run < n && flags[n - 1 - run]) run++;
  if (run >= B.minQuotes) return Array.from({ length: Math.min(run, 8) }, (_, i) => n - 1 - i).reverse();
  const start = Math.max(0, n - B.window);
  const idx: number[] = [];
  for (let i = start; i < n; i++) if (flags[i]) idx.push(i);
  if (idx.length >= B.minQuotes && idx.length / (n - start) >= B.share) return idx;
  return null;
}

// ── rates ────────────────────────────────────────────────────────────────────

function withRate(spec: EstimatorSpec, rateId: string, value: number): CompiledSpec | null {
  const next: EstimatorSpec = { ...spec, rates: (spec.rates ?? []).map((r) => (r.id === rateId ? { ...r, value } : r)) };
  const c = compileSpec(next);
  return c.ok ? c.compiled : null;
}

/** The tool and price book as they would be with one number changed. */
type World = { compiled: CompiledSpec; book: PriceBookEntry[] };

/**
 * One number the tool prices with that the owner could change: a rate on the
 * card, or the price of a price-book item a line sells.
 */
type Knob = {
  /** "rate:cedar_ft" / "book:<workItemId>" — the suggestion key without its direction. */
  id: string;
  value: number;
  /** Ties: a price before a factor. */
  rank: number;
  at: (value: number) => World | null;
  suggest: (to: number, base: SuggestionBase) => Suggestion;
};

function rateKnob(spec: EstimatorSpec, book: PriceBookEntry[], rate: EstimatorRate): Knob {
  return {
    id: `rate:${rate.id}`,
    value: rate.value,
    rank: rate.kind === "price" ? 1 : 0,
    at: (v) => {
      const compiled = withRate(spec, rate.id, v);
      return compiled ? { compiled, book } : null;
    },
    suggest: (to, base) => ({ ...base, kind: "rate", rateId: rate.id, label: rate.label, unit: rate.unit, rateKind: rate.kind, from: rate.value, to }),
  };
}

function bookKnob(compiled: CompiledSpec, book: PriceBookEntry[], entry: PriceBookEntry): Knob {
  return {
    id: `book:${entry.id}`,
    value: entry.unitPrice,
    rank: 1,
    at: (v) => ({ compiled, book: book.map((b) => (b.id === entry.id ? { ...b, unitPrice: v } : b)) }),
    suggest: (to, base) => ({ ...base, kind: "price_book", workItemId: entry.id, name: entry.name, from: entry.unitPrice, to }),
  };
}

function amountsByKey(w: World | null, inputs: Record<string, unknown>): Map<string, number> | null {
  const now = w && linesOf(w.compiled, inputs, w.book);
  if (!now) return null;
  return new Map(keyed(now.lines).map((k) => [k.key, amount(k.line)] as const));
}

type RatePoint = {
  r: Read;
  /** The lines this rate moves on this job. */
  keys: string[];
  tool: number;
  sent: number;
  edited: boolean;
  /** The rate that would have produced what the owner sent (null = no rate does). */
  implied: number | null;
};

/** What this number has to do with this quote, or null when it has nothing to do with it. */
function ratePoint(base: World, rate: Knob, r: Read): RatePoint | null {
  if (r.atMinimum) return null; // the minimum set this price, not the rate
  const cur = amountsByKey(base, r.obs.inputs);
  const bump = amountsByKey(rate.at(rate.value * 1.07), r.obs.inputs);
  if (!cur || !bump) return null;
  const keys = [...new Set([...cur.keys(), ...bump.keys()])].filter((k) => Math.abs((cur.get(k) ?? 0) - (bump.get(k) ?? 0)) > 0.005);
  if (keys.length === 0) return null;
  const byKey = new Map(r.pairs.map((p) => [p.key, p] as const));
  // a line the owner took off, or one that only exists at the higher rate: not rate evidence
  if (keys.some((k) => !byKey.has(k))) return null;
  const tool = cents(keys.reduce((s, k) => s + byKey.get(k)!.tool, 0));
  const sent = cents(keys.reduce((s, k) => s + byKey.get(k)!.sent, 0));
  if (same(tool, sent)) return { r, keys, tool, sent, edited: false, implied: rate.value };

  // solve for the rate that gives `sent` on these lines: secant from (today, +7%)
  const f = (v: number): number | null => {
    const m = amountsByKey(rate.at(v), r.obs.inputs);
    return m ? keys.reduce((s, k) => s + (m.get(k) ?? 0), 0) : null;
  };
  let x0 = rate.value;
  let y0 = tool;
  let x1 = rate.value * 1.07;
  let y1 = keys.reduce((s, k) => s + (bump.get(k) ?? 0), 0);
  let implied: number | null = null;
  for (let i = 0; i < 8; i++) {
    if (Math.abs(y1 - y0) < 1e-9) break;
    const x2 = x1 + ((sent - y1) * (x1 - x0)) / (y1 - y0);
    if (!Number.isFinite(x2) || x2 <= 0 || x2 > rate.value * 5 || x2 < rate.value / 5) break;
    const y2 = f(x2);
    if (y2 == null) break;
    // close enough: the tool rounds its unit prices to the cent, so a long line moves in steps
    if (Math.abs(y2 - sent) <= Math.max(0.5, Math.abs(sent) * 0.002)) {
      implied = x2;
      break;
    }
    x0 = x1;
    y0 = y1;
    x1 = x2;
    y1 = y2;
  }
  return { r, keys, tool, sent, edited: true, implied };
}

type Candidate = { suggestion: Suggestion; /** share of the recent quotes it gets right, then how many */ score: [number, number, number]; obsIds: Set<string>; lineKeys: Set<string> };

function rateCandidate(base: World, rate: Knob, reads: Read[], held: Held[]): Candidate | null {
  const B = CORRECTION_BAR;
  const points = reads.map((r) => ratePoint(base, rate, r)).filter((p): p is RatePoint => p != null);
  const edits = points.filter((p) => p.edited);
  if (edits.length === 0) return null;
  const dir = (p: RatePoint) => (p.sent > p.tool ? "up" : "down");
  const key = `${rate.id}:${dir(edits[edits.length - 1])}`;
  if (edits.length < B.minQuotes) {
    held.push({ key, reason: "few" });
    return null;
  }
  const idx = usual(points.map((p) => p.edited));
  if (!idx) {
    held.push({ key, reason: "mixed" });
    return null;
  }
  const ev = idx.map((i) => points[i]);
  if (new Set(ev.map(dir)).size > 1) {
    held.push({ key, reason: "both_ways" });
    return null;
  }
  if (ev.some((p) => p.implied == null)) {
    held.push({ key, reason: "scattered" });
    return null;
  }
  const implied = ev.map((p) => p.implied!);
  const mid = median(implied);
  if ((Math.max(...implied) - Math.min(...implied)) / mid > B.spread) {
    held.push({ key, reason: "scattered" });
    return null;
  }
  const to = niceNumber(mid);
  if (Math.abs(to - rate.value) / Math.abs(rate.value) < B.minChange) {
    held.push({ key, reason: "tiny" });
    return null;
  }
  // the proof: price the recent jobs again with the change
  const after = rate.at(to);
  if (!after) return null;
  const first = Math.min(idx[0], Math.max(0, points.length - B.window));
  const recent = points.slice(first);
  let matchBefore = 0;
  let matchAfter = 0;
  let evidenceRight = 0;
  for (const p of recent) {
    if (matches(p.tool, p.sent)) matchBefore++;
    const m = amountsByKey(after, p.r.obs.inputs);
    const now = m ? cents(p.keys.reduce((s, k) => s + (m.get(k) ?? 0), 0)) : NaN;
    const ok = Number.isFinite(now) && matches(now, p.sent);
    if (ok) matchAfter++;
    if (ok && ev.includes(p)) evidenceRight++;
  }
  if (evidenceRight < B.minQuotes || evidenceRight / ev.length < B.share || matchAfter <= matchBefore) {
    held.push({ key, reason: "unproven" });
    return null;
  }
  const won = ev.filter((p) => p.r.obs.outcome === "won").length;
  const lost = ev.filter((p) => p.r.obs.outcome === "lost").length;
  if (to > rate.value && won === 0 && lost >= 2) {
    held.push({ key, reason: "not_winning" });
    return null;
  }
  return {
    suggestion: rate.suggest(to, {
      key,
      quotes: ev.map((p) => ({ id: p.r.obs.id, quoteNumber: p.r.obs.quoteNumber, at: p.r.obs.at, tool: p.tool, sent: p.sent, outcome: p.r.obs.outcome })),
      proof: { checked: recent.length, matchBefore, matchAfter },
    }),
    score: [matchAfter / recent.length, evidenceRight, rate.rank],
    obsIds: new Set(ev.map((p) => p.r.obs.id)),
    lineKeys: new Set(ev.flatMap((p) => p.keys)),
  };
}

// ── a minimum ────────────────────────────────────────────────────────────────

function minimumCandidate(spec: EstimatorSpec, book: PriceBookEntry[], reads: Read[], held: Held[]): Candidate | null {
  const B = CORRECTION_BAR;
  const key = "minimum:up";
  const recent = reads.slice(-8);
  const raised = recent.filter((r) => r.added.length === 0 || r.added.every((l) => /minimum/i.test(l.name))).filter((r) => r.sentTotal > r.toolTotal && !same(r.toolTotal, r.sentTotal));
  if (raised.length < B.minQuotes) return null;
  // the floor: the sent totals agree with each other while the tool's own totals do not
  const floor = median(raised.map((r) => r.sentTotal));
  const atFloor = raised.filter((r) => Math.abs(r.sentTotal - floor) / floor <= 0.01);
  if (atFloor.length < B.minQuotes) return null;
  const tools = atFloor.map((r) => r.toolTotal);
  if ((Math.max(...tools) - Math.min(...tools)) / floor < 0.03) return null; // same job every time: can't tell a floor from a markup
  if (recent.some((r) => r.sentTotal < floor * 0.98)) {
    held.push({ key, reason: "mixed" }); // they do go under it
    return null;
  }
  const to = niceNumber(floor);
  if (spec.minimumTotal != null && to <= spec.minimumTotal) return null;
  const c = compileSpec({ ...spec, minimumTotal: to });
  if (!c.ok) return null;
  let matchBefore = 0;
  let matchAfter = 0;
  for (const r of recent) {
    if (matches(r.toolTotal, r.sentTotal)) matchBefore++;
    const run = runCompiled(c.compiled, r.obs.inputs, book);
    if (run.ok && matches(run.subtotal, r.sentTotal)) matchAfter++;
  }
  if (matchAfter - matchBefore < B.minQuotes || matchAfter / recent.length < B.share) {
    held.push({ key, reason: "unproven" });
    return null;
  }
  return {
    suggestion: {
      kind: "minimum",
      key,
      from: spec.minimumTotal ?? null,
      to,
      quotes: atFloor.map((r) => ({ id: r.obs.id, quoteNumber: r.obs.quoteNumber, at: r.obs.at, tool: r.toolTotal, sent: r.sentTotal, outcome: r.obs.outcome })),
      proof: { checked: recent.length, matchBefore, matchAfter },
    },
    score: [matchAfter / recent.length, atFloor.length, 2],
    obsIds: new Set(atFloor.map((r) => r.obs.id)),
    lineKeys: new Set(atFloor.flatMap((r) => r.pairs.map((p) => p.key))),
  };
}

// ── rounding ─────────────────────────────────────────────────────────────────

/**
 * They send round numbers: the quote goes out untouched except that its
 * total sits on a whole step the tool's total did not. Offered only when
 * one step and one direction reproduce nearly every recent quote exactly.
 * A quote with a real edit on it counts against (what was rounded there was
 * not the tool's price). The price that gets rounded is the one the client
 * sees: after the tool's discount rules on one side and the quote's own
 * discount on the other, so a discount the owner changed by hand counts against too.
 */
function roundingCandidate(spec: EstimatorSpec, reads: Read[], held: Held[]): Candidate | null {
  const B = CORRECTION_BAR;
  if (spec.roundTo) return null;
  const recent = reads.slice(-6);
  // "only the total was rounded": no line added or removed, and at most one line moved (the one they nudged) —
  // the exact-total test below does the rest
  const untouched = (r: Read) => r.added.length === 0 && r.removed.length === 0 && r.pairs.filter((p) => Math.abs(p.sent - p.tool) >= 0.5).length <= 1;
  // A quote keeps unit prices to the cent, so rounding a total by nudging "143 ft at $30.94" lands within
  // half a cent per unit of the round number, not on it.
  const slack = (r: Read) => Math.max(0.5, 0.005 * Math.max(1, ...r.obs.sentLines.map((l) => l.quantity)));
  let best: { step: number; mode: "nearest" | "up"; hits: Read[]; right: number } | null = null;
  let seen = false;
  for (const step of [...ROUND_STEPS].sort((a, b) => b - a)) {
    for (const mode of ["nearest", "up"] as const) {
      const to = (n: number) => (mode === "up" ? Math.ceil(n / step - 1e-9) * step : Math.round(n / step) * step);
      const hits: Read[] = [];
      let right = 0;
      for (const r of recent) {
        const want = to(r.toolNet);
        const exact = untouched(r) && Math.abs(r.sentNet - want) <= slack(r);
        if (exact) right++;
        if (exact && Math.abs(r.toolNet - want) > slack(r)) hits.push(r); // the tool's own number was not round: they made it so
      }
      if (hits.length > 0) seen = true;
      if (hits.length >= B.minQuotes && right / recent.length >= B.share && (!best || hits.length > best.hits.length)) best = { step, mode, hits, right };
    }
  }
  if (!best) {
    if (seen) held.push({ key: "round", reason: "mixed" });
    return null;
  }
  const exactNow = recent.filter((r) => Math.abs(r.sentNet - r.toolNet) <= slack(r)).length;
  return {
    suggestion: {
      kind: "rounding",
      key: `round:${best.step}:${best.mode}`,
      to: best.step,
      mode: best.mode,
      quotes: best.hits.map((r) => ({ id: r.obs.id, quoteNumber: r.obs.quoteNumber, at: r.obs.at, tool: r.toolNet, sent: r.sentNet, outcome: r.obs.outcome })),
      proof: { checked: recent.length, matchBefore: exactNow, matchAfter: best.right },
    },
    score: [best.right / recent.length, best.hits.length, -1],
    obsIds: new Set(best.hits.map((r) => r.obs.id)),
    lineKeys: new Set(),
  };
}

// ── a line they keep typing in, a line they keep taking off ──────────────────

function addLineCandidates(reads: Read[], held: Held[]): Candidate[] {
  const B = CORRECTION_BAR;
  const recent = reads.slice(-6);
  const groups = new Map<string, { r: Read; line: CorrectionLine }[]>();
  for (const r of recent) {
    const seen = new Set<string>();
    for (const line of r.added) {
      const own = kind(line.name);
      if (!own || /minimum/.test(own)) continue; // a hand-typed minimum is the minimum's business
      // "Haul away" and "Haul-away (1 load)" are one thing: file under the shorter name
      const like = [...groups.keys()].find((g) => within(g, own) || within(own, g));
      let k = like ?? own;
      if (like && own.length < like.length) {
        groups.set(own, groups.get(like)!);
        groups.delete(like);
        k = own;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      groups.set(k, [...(groups.get(k) ?? []), { r, line }]);
    }
  }
  const out: Candidate[] = [];
  for (const [k, hits] of groups) {
    const key = `add:${k}`;
    if (hits.length < B.minQuotes) {
      held.push({ key, reason: "few" });
      continue;
    }
    const prices = hits.map((h) => h.line.unitPrice);
    // the name they type most
    const names = new Map<string, number>();
    for (const h of hits) names.set(h.line.name.trim(), (names.get(h.line.name.trim()) ?? 0) + 1);
    const name = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({
      suggestion: {
        kind: "add_line",
        key,
        name,
        typical: niceNumber(median(prices)),
        low: Math.min(...prices),
        high: Math.max(...prices),
        quotes: hits.map((h) => ({ id: h.r.obs.id, quoteNumber: h.r.obs.quoteNumber, at: h.r.obs.at, tool: 0, sent: amount(h.line), outcome: h.r.obs.outcome })),
        proof: { checked: recent.length, matchBefore: 0, matchAfter: hits.length },
      },
      score: [hits.length / recent.length, hits.length, 0],
      obsIds: new Set(hits.map((h) => h.r.obs.id)),
      lineKeys: new Set(),
    });
  }
  return out;
}

function dropLineCandidates(reads: Read[], held: Held[]): Candidate[] {
  const kinds = new Set(reads.flatMap((r) => r.removed.map((l) => kind(l.name))));
  const out: Candidate[] = [];
  for (const k of kinds) {
    if (!k) continue;
    const key = `drop:${k}`;
    // every quote where the tool put this line on, and whether the owner took it off
    const seen = reads
      .map((r) => {
        const off = r.removed.find((l) => kind(l.name) === k);
        const on = r.pairs.find((p) => kind(p.name) === k);
        return off ? { r, off: true, name: off.name, amt: amount(off.line) } : on ? { r, off: false, name: on.name, amt: on.tool } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    const idx = usual(seen.map((s) => s.off));
    if (!idx) {
      held.push({ key, reason: seen.filter((s) => s.off).length < CORRECTION_BAR.minQuotes ? "few" : "mixed" });
      continue;
    }
    const ev = idx.map((i) => seen[i]);
    const window = Math.min(seen.length, Math.max(CORRECTION_BAR.window, ev.length));
    out.push({
      suggestion: {
        kind: "drop_line",
        key,
        name: ev[ev.length - 1].name,
        quotes: ev.map((e) => ({ id: e.r.obs.id, quoteNumber: e.r.obs.quoteNumber, at: e.r.obs.at, tool: e.amt, sent: 0, outcome: e.r.obs.outcome })),
        proof: { checked: window, matchBefore: window - ev.length, matchAfter: ev.length },
      },
      score: [ev.length / window, ev.length, 0],
      obsIds: new Set(ev.map((e) => e.r.obs.id)),
      lineKeys: new Set(ev.flatMap((e) => e.r.removed.filter((l) => kind(l.name) === k).map((l) => l.key))),
    });
  }
  return out;
}

// ── the whole read ───────────────────────────────────────────────────────────

const better = (a: Candidate, b: Candidate) => b.score[0] - a.score[0] || b.score[1] - a.score[1] || b.score[2] - a.score[2];
const overlap = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/**
 * Read a tool's sent quotes and return what, if anything, is worth offering
 * the owner. `observations` in any order; `now` only bounds how far back to look.
 */
export function analyzeCorrections(rawSpec: unknown, priceBook: PriceBookEntry[], observations: Observation[], opts: { dismissed?: Dismissal[]; now?: Date } = {}): CorrectionReport {
  const B = CORRECTION_BAR;
  const real = compileSpec(rawSpec);
  if (!real.ok) return { suggestions: [], held: [], usable: 0, stale: 0 };
  // Everything but the rounding check reads the tool with its rounding off:
  // a rounded total moves in steps, which hides what a rate would have to be,
  // and the comparisons below already forgive rounding.
  const c = compileSpec({ ...real.compiled.spec, roundTo: undefined, roundMode: undefined });
  if (!c.ok) return { suggestions: [], held: [], usable: 0, stale: 0 };
  const spec = c.compiled.spec;
  const cutoff = (opts.now ?? new Date()).getTime() - B.maxAgeDays * 86_400_000;
  const obs = observations
    .filter((o) => new Date(o.at).getTime() >= cutoff)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-B.maxQuotes);
  const reads: Read[] = [];
  let stale = 0;
  for (const o of obs) {
    const r = read(c.compiled, priceBook, o);
    if (r) reads.push(r);
    else stale++;
  }
  const held: Held[] = [];
  if (reads.length < B.minQuotes) return { suggestions: [], held, usable: reads.length, stale };

  const candidates: Candidate[] = [];
  const min = minimumCandidate(spec, priceBook, reads, held);
  if (min) candidates.push(min);
  const base: World = { compiled: c.compiled, book: priceBook };
  for (const rate of spec.rates ?? []) {
    if ((rate.kind !== "price" && rate.kind !== "factor") || !(rate.value > 0)) continue;
    const cand = rateCandidate(base, rateKnob(spec, priceBook, rate), reads, held);
    if (cand) candidates.push(cand);
  }
  // lines priced straight from the price book: the number to change is the item's price
  const named = new Set(c.compiled.priceBookNames.map((n) => n.trim().toLowerCase()));
  for (const entry of priceBook) {
    if (!named.has(entry.name.trim().toLowerCase()) || !(entry.unitPrice > 0)) continue;
    const cand = rateCandidate(base, bookKnob(c.compiled, priceBook, entry), reads, held);
    if (cand) candidates.push(cand);
  }
  const rounding = roundingCandidate(real.compiled.spec, reads, held);
  if (rounding) candidates.push(rounding);
  candidates.push(...addLineCandidates(reads, held), ...dropLineCandidates(reads, held));

  // two explanations for the same edits: keep the one that fits best
  candidates.sort(better);
  const kept: Candidate[] = [];
  for (const cand of candidates) {
    const isPrice = (s: Suggestion) => s.kind === "rate" || s.kind === "minimum" || s.kind === "price_book";
    const clash = isPrice(cand.suggestion) && kept.some((k) => isPrice(k.suggestion) && overlap(k.obsIds, cand.obsIds) && overlap(k.lineKeys, cand.lineKeys));
    if (clash) held.push({ key: cand.suggestion.key, reason: "overlap" });
    else kept.push(cand);
  }

  const dismissed = new Map((opts.dismissed ?? []).map((d) => [d.key, d] as const));
  const suggestions: Suggestion[] = [];
  for (const cand of kept) {
    const d = dismissed.get(cand.suggestion.key);
    if (d) {
      const fresh = [...cand.obsIds].filter((id) => !d.seen.includes(id)).length;
      if (d.mode === "never" || fresh < B.newQuotesToReturn) {
        held.push({ key: cand.suggestion.key, reason: "dismissed" });
        continue;
      }
    }
    suggestions.push(cand.suggestion);
  }
  return { suggestions, held, usable: reads.length, stale };
}

// ── putting a suggestion into words, and into the tool ───────────────────────

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

function rateText(v: number, s: Extract<Suggestion, { kind: "rate" }>): string {
  const unit = (s.unit ?? "").trim();
  if (s.rateKind === "factor") return unit === "%" ? `${v}%` : unit === "×" || unit === "x" ? `${v}×` : `${v}${unit ? ` ${unit}` : ""}`;
  return `${money(v)}${unit ? ` ${unit}` : ""}`;
}

/** The suggestion as the owner reads it: what they do, what the tool does, the question. */
export function suggestionText(s: Suggestion): { title: string; detail: string; action: string } {
  const n = s.quotes.length;
  const of = `${n} of your last ${Math.max(s.proof.checked, n)} quotes from this tool`;
  switch (s.kind) {
    case "rate":
      return {
        title: `${s.label}: you charge about ${rateText(s.to, s)}, the tool says ${rateText(s.from, s)}`,
        detail: `You changed this price on ${of}, the same way each time. With ${rateText(s.to, s)} the tool would have matched ${s.proof.matchAfter} of those ${s.proof.checked}; today it matches ${s.proof.matchBefore}.`,
        action: `Change to ${rateText(s.to, s)}`,
      };
    case "price_book":
      return {
        title: `${s.name}: you charge about ${money(s.to)}, your price book says ${money(s.from)}`,
        detail: `You changed this price on ${of}, the same way each time. This tool takes the price from your price book, so the change is made there and applies everywhere the item is used. With ${money(s.to)} the tool would have matched ${s.proof.matchAfter} of those ${s.proof.checked}; today it matches ${s.proof.matchBefore}.`,
        action: `Change the price book to ${money(s.to)}`,
      };
    case "minimum":
      return {
        title: `Small jobs: you charge at least ${money(s.to)}`,
        detail: `${n} recent quotes went out at ${money(s.to)} when the tool priced them lower${s.from != null ? ` (its minimum is ${money(s.from)})` : " (it has no minimum)"}. With a ${money(s.to)} minimum the tool would have matched ${s.proof.matchAfter} of your last ${s.proof.checked}; today it matches ${s.proof.matchBefore}.`,
        action: `Set the minimum to ${money(s.to)}`,
      };
    case "rounding":
      return {
        title: `You round your prices ${s.mode === "up" ? "up to the next" : "to the nearest"} ${money(s.to)}`,
        detail: `${n} of your last ${s.proof.checked} quotes from this tool went out with the total rounded by hand and nothing else changed. The tool can round for you; it would have matched ${s.proof.matchAfter} of those ${s.proof.checked} to the dollar, and today it matches ${s.proof.matchBefore}.`,
        action: `Round ${s.mode === "up" ? "up to the next" : "to the nearest"} ${money(s.to)}`,
      };
    case "add_line":
      return {
        title: `You keep adding “${s.name}” by hand`,
        detail: `It was typed onto ${of}, at ${s.low === s.high ? money(s.low) : `${money(s.low)} to ${money(s.high)}`}. The tool can ask about it instead.`,
        action: "Add it to the tool",
      };
    case "drop_line":
      return {
        title: `You keep taking “${s.name}” off`,
        detail: `You removed it from ${n} of the last ${s.proof.checked} quotes where the tool added it.`,
        action: "Change the tool",
      };
  }
}

/** The proven suggestions as one line each — what the builder is told about how this owner prices. */
export function correctionFacts(report: CorrectionReport): string[] {
  return report.suggestions.slice(0, 6).map((s) => `${suggestionText(s).title} (${s.quotes.length} recent quotes).`);
}

/**
 * A rate or minimum suggestion applied to the spec — plain data, no model.
 * Null for the kinds that need the builder (a new question, a line to drop).
 */
export function applySuggestion(spec: EstimatorSpec, s: Suggestion): EstimatorSpec | null {
  if (s.kind === "rate") {
    if (!(spec.rates ?? []).some((r) => r.id === s.rateId)) return null;
    return { ...spec, rates: (spec.rates ?? []).map((r) => (r.id === s.rateId ? { ...r, value: s.to, source: "owner" as const } : r)) };
  }
  if (s.kind === "minimum") return { ...spec, minimumTotal: s.to };
  if (s.kind === "rounding") return { ...spec, roundTo: s.to, roundMode: s.mode === "up" ? "up" : undefined };
  return null;
}

/** The change request handed to the builder for the kinds it has to make (the owner's own evidence, in words). */
export function builderRequest(s: Suggestion): string | null {
  if (s.kind === "add_line") {
    const price = s.low === s.high ? money(s.low) : `usually ${money(s.typical)} (I have charged ${money(s.low)} to ${money(s.high)})`;
    return `Add "${s.name}" to this tool as something I can turn on for a job. Price: ${price}. I have been typing this line onto quotes by hand (${s.quotes.length} of my last ${s.proof.checked}). It is not on every job, so ask about it; do not add it automatically. Change nothing else.`;
  }
  if (s.kind === "drop_line") return `Stop adding "${s.name}" automatically. I have taken it off ${s.quotes.length} of the last ${s.proof.checked} quotes it was on. Make it something I can turn on for a job instead of always on. Change nothing else.`;
  return null;
}
