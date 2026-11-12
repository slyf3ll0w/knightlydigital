import { askAIGroundedJson } from "./ai";
import { benchmarkFor, type BenchmarkRate, type TypicalJob } from "./estimator-benchmarks";

/**
 * What the work goes for where this business is — the builder's stand-in
 * for rates nobody gave it (lib/estimator-build.ts). Two sources, merged:
 *
 *   search   → one web-grounded lookup ("what do fence contractors near
 *              Allen, TX charge?"), only when the business has no rates of
 *              its own for the job. Bounded: a slow or failed search just
 *              means the baseline stands alone.
 *   baseline → lib/estimator-benchmarks.ts, always there for a known trade.
 *
 * The baseline also keeps the search honest: a looked-up "typical job"
 * far outside the baseline's range is dropped rather than trusted. Nothing
 * here is the business's own price — every number a tool takes from it is
 * listed under the tool's rates to confirm.
 */

export type MarketRead = {
  /** "Allen, TX", "TX", or "" when the business has no place on file. */
  where: string;
  rates: BenchmarkRate[];
  labor: string;
  typical: TypicalJob | null;
  /** Pages the search read; empty for a baseline-only read. */
  sources: string[];
  searched: boolean;
};

/** A search may run long; the build shouldn't wait on it. */
const SEARCH_BUDGET_MS = 35_000;

type RawRead = { rates?: unknown; labor?: unknown; typical?: unknown; sources?: unknown };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Keep only rate rows that read like a real range. */
export function cleanRates(raw: unknown, max = 8): BenchmarkRate[] {
  if (!Array.isArray(raw)) return [];
  const out: BenchmarkRate[] = [];
  for (const row of raw) {
    const o = (row ?? {}) as Record<string, unknown>;
    const what = str(o.what, 80), unit = str(o.unit, 30);
    const low = num(o.low), high = num(o.high);
    if (!what || !unit || low === null || high === null) continue;
    if (high < low || high > low * 8) continue;
    out.push({ what, unit, low, high });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A looked-up typical job, kept only when it is sane on its own and — when
 * the trade has a baseline — within shouting distance of it.
 */
export function cleanTypical(raw: unknown, baseline: TypicalJob | null): TypicalJob | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const job = str(o.job, 200);
  const low = num(o.low), high = num(o.high);
  if (!job || low === null || high === null || high < low || high > low * 6) return null;
  if (baseline && (low < baseline.low * 0.4 || high > baseline.high * 2.5)) return null;
  const hoursLow = num(o.hoursLow), hoursHigh = num(o.hoursHigh);
  const hoursOk = hoursLow !== null && hoursHigh !== null && hoursHigh >= hoursLow && (!baseline || (hoursLow >= baseline.hoursLow * 0.3 && hoursHigh <= baseline.hoursHigh * 3));
  return {
    job,
    low,
    high,
    hoursLow: hoursOk ? hoursLow! : baseline?.hoursLow ?? 0,
    hoursHigh: hoursOk ? hoursHigh! : baseline?.hoursHigh ?? 0,
  };
}

function cleanSources(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => str(s, 200))
    .filter((s) => /^https?:\/\//i.test(s))
    .slice(0, 5);
}

/** Put a search read and the baseline together (pure; the search wins where it has something). */
export function mergeMarket(where: string, searched: RawRead | null, baseline: ReturnType<typeof benchmarkFor>): MarketRead | null {
  const found = searched ? cleanRates(searched.rates) : [];
  const names = new Set(found.map((x) => x.what.toLowerCase()));
  const rates = [...found, ...(baseline?.rates ?? []).filter((x) => !names.has(x.what.toLowerCase()))].slice(0, 12);
  // The search was asked to price the baseline's own typical job, so a sane
  // answer replaces the baseline's range (it is local) but keeps its wording:
  // the tool's "typical" sample is written to match that description.
  const looked = searched ? cleanTypical(searched.typical, baseline?.typical ?? null) : null;
  const typical = baseline?.typical ? (looked ? { ...looked, job: baseline.typical.job } : baseline.typical) : looked;
  const labor = baseline?.labor || (searched ? str(searched.labor, 400) : "");
  if (rates.length === 0 && !typical) return null;
  return { where, rates, labor, typical, sources: searched ? cleanSources(searched.sources) : [], searched: found.length > 0 };
}

export async function loadMarket(opts: {
  tradeKey: string | null;
  tradeName: string;
  /** The owner's own words — which jobs the tool is for. */
  description: string;
  city: string | null;
  state: string | null;
  companyId: string;
  /** Run the web lookup (new tools with no rates to go on); false = baseline only. */
  search: boolean;
}): Promise<MarketRead | null> {
  const where = [opts.city, opts.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  const baseline = benchmarkFor(opts.tradeKey, opts.state);
  let searched: RawRead | null = null;
  if (opts.search && opts.tradeName) {
    const ask = askAIGroundedJson<RawRead>({
      companyId: opts.companyId,
      temperature: 0.1,
      maxOutputTokens: 1500,
      system: "You research what home-service work sells for. Search the web, read a few current sources, and answer with ONLY a JSON object — no prose before or after it.",
      prompt: `What do ${opts.tradeName} businesses ${where ? `in and around ${where}` : "in the United States"} charge homeowners right now?
The tool being built: ${opts.description.slice(0, 400) || opts.tradeName}

Answer with ONLY this JSON:
{"rates": [{"what": "the service or material option, specific (e.g. 'Wood privacy fence, 6 ft')", "unit": "ft | sq ft | each | hour | visit | …", "low": 0, "high": 0}], "labor": "one sentence on how fast a crew does this work, in person-hours", "typical": {"job": "${baseline ? baseline.typical.job.replace(/"/g, "'") : "the most common job, described specifically (size, material, what's included)"}", "low": 0, "high": 0, "hoursLow": 0, "hoursHigh": 0}, "sources": ["https://…"]}

Rules: 4–8 rate rows covering the options that move the price most. low/high are what the CUSTOMER pays (labor + materials unless the row says otherwise), in US dollars, as plain numbers. Prefer local or regional figures over national ones; if you only find national figures, use them. "typical" prices exactly the job described; hours are total PERSON-hours on site. "sources" are the pages you actually used.`,
    }).catch(() => null);
    searched = await Promise.race([ask, new Promise<null>((resolve) => setTimeout(() => resolve(null), SEARCH_BUDGET_MS))]);
  }
  return mergeMarket(where, searched, baseline);
}

const money = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`);

/** The prompt block. */
export function marketText(m: MarketRead): string {
  const head = `MARKET NUMBERS${m.where ? ` — ${m.where}` : ""} (what this work typically goes for${m.searched ? ", from a web lookup just now plus trade baselines" : ", trade baselines"}). These are NOT this business's prices.`;
  return [
    head,
    m.rates.length > 0 ? `Going rates (customer price, low–high):\n${m.rates.map((x) => `- ${x.what}: ${money(x.low)}–${money(x.high)} per ${x.unit}`).join("\n")}` : null,
    m.labor ? `How long it takes: ${m.labor}` : null,
    m.typical ? `The typical job: ${m.typical.job} — sells for ${money(m.typical.low)}–${money(m.typical.high)}${m.typical.hoursHigh > 0 ? ` and takes ${m.typical.hoursLow}–${m.typical.hoursHigh} person-hours` : ""}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** How the draft must use the block (new tools and changes alike). */
export function marketRules(m: MarketRead): string {
  return `How to use the MARKET NUMBERS:
- The owner's own words, their price sheet, their price book and what they've charged on quotes ALWAYS win. Market numbers only fill a rate nobody gave you.
- A rate you take from the market is set near the MIDDLE of its range, and goes in "placeholders" worded for the owner: "<what>: $<your number> per <unit> — market estimate${m.where ? ` for ${m.where}` : ""} ($<low>–$<high>); set yours". One line per guessed rate, most important first.
- "hours" are PERSON-hours (crew size × time on site). Derive them from "How long it takes", not from a feeling — and when you had to assume the pace, add ONE placeholder for it: "Labor time: about <n> person-hours per <unit> — estimate; set your crew's pace".
- When a typical job is given, your "Typical job" sample must BE that job (same size, same options), so its total and hours can be checked against the range. If the owner's own rates put it outside the range, keep their rates.`;
}
