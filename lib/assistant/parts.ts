import { askAI, extractJsonObject } from "../ai";
import { isManager } from "../permissions";
import { str, type Tool } from "./core";

/**
 * Outside-world price lookups for estimate tools (docs/plans/ai-estimators-2026-09-19.md,
 * "External prices"). There is no public price API for the big-box or trade
 * suppliers, and scraping their pages is both against their terms and
 * bot-blocked, so the honest tool is a Google-Search-grounded model call:
 * it returns a BALLPARK with sources, clearly labelled, for the owner to
 * confirm — and the number lands in the price book (create_service as a
 * PRODUCT with a cost), so running the estimate tool stays free. Live
 * per-quote lookups are deliberately not offered: slow, metered, and no
 * more accurate than a supplier's counter price.
 *
 * Cost: the grounded call's tokens fold into the turn's meter (ctx.addUsage).
 * Google Search grounding carries its own per-request charge on the paid
 * tier that token pricing does not see — see cost-controls.md.
 */

type Lookup = {
  item?: string;
  typical?: number;
  low?: number;
  high?: number;
  unit?: string;
  sources?: { name?: string; price?: number; url?: string }[];
  confidence?: string;
  notes?: string;
};

const lookupPartPrice: Tool = {
  decl: {
    name: "lookup_part_price",
    description:
      "Look up a BALLPARK retail price for a part or material from public listings (Google-grounded) — e.g. '40-gallon gas water heater', '50 ft 12/2 Romex', 'Kohler K-3810 toilet'. Returns typical/low/high with sources; always a ballpark the owner must confirm with their supplier. Use it while BUILDING an estimate tool or price-book item, then put the number in the price book (create_service type PRODUCT, unitCost = what they pay, unitPrice = what they charge) so estimates run free. Never call it per quote.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "the part/material, as specific as the user was (brand, model, size, quantity)" },
        region: { type: "string", description: "optional city/state to bias local pricing" },
      },
      required: ["query"],
    },
  },
  allowed: (a) => isManager(a.role),
  run: async (actor, args, ctx) => {
    const query = str(args.query, 200);
    if (!query) return { error: "query is required" };
    const region = str(args.region, 80);
    const prompt = `Find current retail prices for: ${query}${region ? ` (near ${region}, USA)` : " (USA)"}.
Search major suppliers (Home Depot, Lowe's, Ferguson, SupplyHouse, Grainger, Amazon, manufacturer). Reply with ONLY a JSON object:
{"item": "what you priced (be specific)", "unit": "each | per ft | per box …", "typical": number, "low": number, "high": number,
 "sources": [{"name": "store", "price": number, "url": "page url"}], "confidence": "high | medium | low", "notes": "one line: variants, what drove the range, anything the buyer should confirm"}
Numbers in USD without symbols. If you cannot find real listings, set confidence "low" and say so in notes rather than guessing.`;
    const text = await askAI({
      prompt,
      useSearch: true,
      temperature: 0.2,
      maxOutputTokens: 1024,
      companyId: actor.companyId,
      onUsage: (u) => ctx.addUsage?.(u),
    });
    if (!text) return { error: "The price lookup didn't come back — try again in a moment, or ask the user for their supplier's price." };
    const parsed = extractJsonObject<Lookup>(text);
    if (!parsed) return { error: "Couldn't read a price out of the search results.", raw: text.slice(0, 400) };
    const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
    return {
      item: str(parsed.item, 160) || query,
      unit: str(parsed.unit, 40) || "each",
      typical: n(parsed.typical),
      low: n(parsed.low),
      high: n(parsed.high),
      sources: (Array.isArray(parsed.sources) ? parsed.sources : []).slice(0, 6).map((s) => ({ name: str(s?.name, 60), price: n(s?.price), url: str(s?.url, 300) || undefined })),
      confidence: ["high", "medium", "low"].includes(str(parsed.confidence, 10)) ? str(parsed.confidence, 10) : "low",
      notes: str(parsed.notes, 300),
      asOf: new Date().toISOString().slice(0, 10),
      caveat: "Ballpark from public listings — tell the user so, and that their supplier's price wins. Offer to add it to the price book (create_service, type PRODUCT) with the cost they confirm.",
    };
  },
};

export const partsTools: Tool[] = [lookupPartPrice];
