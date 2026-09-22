import { compileSpec, ESTIMATOR_LIMITS, type EstimatorSpec, type PriceBookEntry } from "./estimator";

/**
 * The Library (docs/plans/ai-estimators-2026-09-19.md, Batch 10): a tool
 * shared with other businesses has to compile in a company whose price book
 * knows none of the sharer's items. `toPortableSpec` rewrites a spec so it
 * depends on nothing outside itself:
 *   - every line's `workItemName` link is dropped; when the line had no
 *     unitPrice of its own, the linked item's price becomes a literal rate
 *   - every `price("Name")` / `cost("Name")` inside an expression becomes
 *     the literal number from the sharer's book (cost unknown → 0)
 *   - `placeholders` is replaced by one "rates to confirm" entry per pricing
 *     line (plus the minimum), so the adopter's Overview nags them to set
 *     their own numbers instead of quietly quoting someone else's
 * Pure — no Prisma. The result still passes compileSpec; callers save only
 * what compiles.
 */

export type PortableResult = { ok: true; spec: EstimatorSpec } | { ok: false; errors: string[] };

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;
/** A literal for an expression: ≤ 2 decimals, no exponent. */
const lit = (n: number) => (Math.round(n * 100) / 100).toString();

/** Replace price("X") / cost("X") calls in one expression source with literals from the book. */
export function inlinePriceRefs(src: string, book: Map<string, PriceBookEntry>): string {
  // The grammar quotes string literals with ' or "; names never contain the
  // closing quote (they're price-book names), so a non-greedy match is exact.
  return src.replace(/\b(price|cost)\(\s*(['"])(.*?)\2\s*\)/g, (whole, fn: string, _q: string, name: string) => {
    const item = book.get(name.trim().toLowerCase());
    if (!item) return whole; // unknown to the sharer too — compile will say so
    if (fn === "price") return lit(item.unitPrice);
    return lit(item.unitCost ?? 0);
  });
}

export function toPortableSpec(spec: EstimatorSpec, book: PriceBookEntry[]): PortableResult {
  const byName = new Map(book.map((b) => [b.name.trim().toLowerCase(), b]));
  const errors: string[] = [];
  const inline = (s: string | undefined) => (s === undefined ? undefined : inlinePriceRefs(s, byName));

  const variables = spec.variables.map((v) => ({ ...v, expr: inlinePriceRefs(v.expr, byName) }));
  const inputs = spec.inputs.map((i) => (i.showWhen ? { ...i, showWhen: inlinePriceRefs(i.showWhen, byName) } : i));
  const confirm: string[] = [];
  const lines = spec.lines.map((l) => {
    const { workItemName, ...rest } = l;
    let unitPrice = inline(rest.unitPrice);
    if (workItemName) {
      const item = byName.get(workItemName.trim().toLowerCase());
      if (!unitPrice) {
        if (!item) {
          errors.push(`"${l.name}" sells price-book item "${workItemName}", which isn't in the price book — set a unit price on the line first.`);
          unitPrice = "0";
        } else unitPrice = lit(item.unitPrice);
      }
    }
    const rateNote = unitPrice && /^\d+(\.\d+)?$/.test(unitPrice) ? money(Number(unitPrice)) : "a formula";
    confirm.push(`${l.name}: ${rateNote} — from the Library, set your own rate`);
    // templates ({expr}) can carry price()/cost() too — same rewrite
    return {
      ...rest,
      name: inlinePriceRefs(rest.name, byName),
      ...(rest.description ? { description: inline(rest.description) } : {}),
      ...(rest.quantity ? { quantity: inline(rest.quantity) } : {}),
      ...(rest.when ? { when: inline(rest.when) } : {}),
      ...(unitPrice ? { unitPrice } : {}),
    };
  });
  if (spec.minimumTotal) confirm.push(`Minimum job charge: ${money(spec.minimumTotal)} — from the Library, set your own`);

  const out: EstimatorSpec = {
    ...spec,
    inputs,
    variables,
    lines,
    ...(spec.quoteTitle ? { quoteTitle: inline(spec.quoteTitle) } : {}),
    ...(spec.clientMessage ? { clientMessage: inline(spec.clientMessage) } : {}),
    placeholders: confirm.slice(0, ESTIMATOR_LIMITS.placeholders),
  };
  if (errors.length > 0) return { ok: false, errors };
  const c = compileSpec(out);
  if (!c.ok) return { ok: false, errors: c.errors };
  if (c.compiled.priceBookNames.length > 0) {
    return { ok: false, errors: [`Still tied to the price book: ${c.compiled.priceBookNames.join(", ")}`] };
  }
  return { ok: true, spec: c.compiled.spec };
}

/** The facts line a listing card shows ("6 questions · 3 packages · map measure"). */
export function listingFacts(spec: EstimatorSpec, atlasName = "Atlas"): string[] {
  const tiers = spec.inputs.find((i) => i.type === "select" && i.style === "packages");
  return [
    `${spec.inputs.length} question${spec.inputs.length === 1 ? "" : "s"}`,
    tiers && tiers.type === "select" ? `${tiers.options.length} packages` : null,
    spec.inputs.some((i) => i.type === "map") ? "map measure" : null,
    spec.lines.length > 0 ? `${spec.lines.length} pricing line${spec.lines.length === 1 ? "" : "s"}` : null,
    spec.inputs.some((i) => i.askAtlas) ? `${atlasName} assesses` : null,
  ].filter((x): x is string => Boolean(x));
}

/** Every /api/estimate-images/… URL a spec references (question and option pictures). */
export function imageIdsIn(spec: EstimatorSpec): string[] {
  const ids = new Set<string>();
  const take = (url?: string) => {
    const m = url && /^\/api\/estimate-images\/([A-Za-z0-9_-]{8,64})$/.exec(url);
    if (m) ids.add(m[1]);
  };
  for (const i of spec.inputs) {
    take(i.image);
    if ("options" in i) for (const o of i.options) take(o.image);
  }
  return Array.from(ids);
}

/** The same spec with picture URLs swapped by id (missing ids keep their URL). */
export function remapImages(spec: EstimatorSpec, map: Map<string, string>): EstimatorSpec {
  const swap = (url?: string) => {
    const m = url && /^\/api\/estimate-images\/([A-Za-z0-9_-]{8,64})$/.exec(url);
    const next = m ? map.get(m[1]) : undefined;
    return next ? `/api/estimate-images/${next}` : url;
  };
  return {
    ...spec,
    inputs: spec.inputs.map((i) => {
      const base = i.image ? { ...i, image: swap(i.image) } : i;
      if ("options" in base) return { ...base, options: base.options.map((o) => (o.image ? { ...o, image: swap(o.image) } : o)) };
      return base;
    }),
  };
}
