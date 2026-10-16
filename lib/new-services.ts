/**
 * Services that save themselves (David 2026-10-16: "save it silently").
 *
 * A company fresh off pen and paper has an empty price book, so every quote
 * line is typed by hand — and the tenth quote is as slow as the first. When
 * a quote, invoice or job is saved, any line someone typed (not picked from
 * the book) with a real price becomes a Service, so the next form
 * autocompletes it. Pure selection here (unit-tested in
 * scripts/test-new-services.ts); the POSTs live in lib/save-new-services.ts.
 */

export type ServiceLine = {
  name: string;
  description?: string | null;
  unitPrice: string | number;
  unitCost?: string | number | null;
  workItemId?: string | null;
};

export type NewServiceCandidate = {
  name: string;
  description: string | null;
  unitPrice: number;
  unitCost: number | null;
};

/** Case- and whitespace-insensitive name key: "House  wash" ≡ "house wash". */
export function serviceKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The lines worth saving: typed (no price-book link), named, priced above
 * zero, not already in the book, one per name. A line's price and cost ride
 * along; a blank description stays blank.
 */
export function newServicesFrom(lines: ServiceLine[], existing: { name: string }[]): NewServiceCandidate[] {
  const known = new Set(existing.map((w) => serviceKey(w.name)));
  const out: NewServiceCandidate[] = [];
  for (const li of lines) {
    const name = (li.name ?? "").trim();
    if (!name || li.workItemId) continue;
    const price = typeof li.unitPrice === "number" ? li.unitPrice : parseFloat(li.unitPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = serviceKey(name);
    if (known.has(key)) continue;
    known.add(key);
    const costRaw = li.unitCost;
    const cost =
      costRaw === null || costRaw === undefined || costRaw === ""
        ? null
        : typeof costRaw === "number"
          ? costRaw
          : parseFloat(costRaw);
    out.push({
      name: name.slice(0, 120),
      description: (li.description ?? "").trim().slice(0, 500) || null,
      unitPrice: Math.round(price * 100) / 100,
      unitCost: cost !== null && Number.isFinite(cost) ? Math.round(cost * 100) / 100 : null,
    });
  }
  return out;
}
