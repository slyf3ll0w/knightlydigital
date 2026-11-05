import type { ToolKind, ToolLine } from "@/lib/tool-doc";
import { TRADES, type Trade } from "@/lib/wb-trades";

/**
 * The free tools on the marketing site (/tools): one generator engine
 * (components/wb/tools/DocGenerator.tsx), two documents, and a template page
 * per trade that opens the generator pre-filled with that trade's usual
 * line items. The sample prices here are illustrative starting points a
 * visitor edits — not WorkBench prices (scripts/test-wb-site.ts scans for
 * those) — and every template page says so.
 */

export const TOOLS_PATH = "/tools";

export type ToolMeta = {
  kind: ToolKind;
  slug: string;
  /** The h1 and <title>. */
  title: string;
  /** The <meta name="description">. */
  description: string;
  /** "invoice" / "estimate" — the noun used in copy. */
  noun: string;
  /** /tools/<templateSlug>/<trade> */
  templateSlug: string;
};

export const TOOLS: ToolMeta[] = [
  {
    kind: "invoice",
    slug: "invoice-generator",
    title: "Free invoice generator for contractors",
    description:
      "Make a professional invoice in your browser and download the PDF free. No account, no email, no watermark. Line items, sales tax, discounts, your logo and your colors. Built by WorkBench FSM for plumbers, electricians, HVAC, cleaning, lawn care and every home-service trade.",
    noun: "invoice",
    templateSlug: "invoice-template",
  },
  {
    kind: "estimate",
    slug: "estimate-generator",
    title: "Free estimate generator for contractors",
    description:
      "Write a clean, professional estimate and download the PDF free. No account, no email, no watermark. Optional line items the client can pick, a deposit line, sales tax and your logo. Built by WorkBench FSM for home-service trades.",
    noun: "estimate",
    templateSlug: "estimate-template",
  },
];

export function toolBySlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolByTemplateSlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.templateSlug === slug);
}

export function toolPath(tool: ToolMeta): string {
  return `${TOOLS_PATH}/${tool.slug}`;
}

export function templatePath(tool: ToolMeta, trade: Trade): string {
  return `${TOOLS_PATH}/${tool.templateSlug}/${trade.slug}`;
}

export type TemplateLine = Omit<ToolLine, "id">;

type TradeTemplate = {
  /** Printed on the document for the client. */
  message: string;
  lines: TemplateLine[];
};

const L = (name: string, description: string, unitPrice: number, quantity = 1, optional = false): TemplateLine => ({
  name,
  description,
  unitPrice,
  quantity,
  optional,
});

/**
 * Typical line items per trade. Optional lines only show as optional on
 * the estimate; the invoice template uses the same list with every line
 * required.
 */
export const TRADE_TEMPLATES: Record<string, TradeTemplate> = {
  plumbing: {
    message: "Thank you for choosing us. Parts carry the manufacturer's warranty; labor is guaranteed for one year.",
    lines: [
      L("Service call", "Diagnosis and first hour on site", 125),
      L("Water heater replacement", "50-gallon gas unit, installed, old unit hauled away", 1850),
      L("Expansion tank", "Required by code on closed systems", 240, 1, true),
      L("Shut-off valve replacement", "Quarter-turn ball valve", 95, 2),
      L("Permit", "City plumbing permit, billed at cost", 85),
    ],
  },
  hvac: {
    message: "Thank you for your business. Equipment carries the manufacturer's warranty; our labor is guaranteed for one year.",
    lines: [
      L("Diagnostic visit", "System inspection and diagnosis", 109),
      L("Capacitor replacement", "45/5 MFD dual run capacitor", 185),
      L("Refrigerant", "R-410A, per pound", 75, 2),
      L("Condenser coil cleaning", "Chemical clean and rinse", 150, 1, true),
      L("Maintenance plan", "Two tune-ups a year, priority scheduling", 199, 1, true),
    ],
  },
  electrical: {
    message: "Thank you for your business. All work is performed to current NEC code and carries a one-year labor warranty.",
    lines: [
      L("Service call", "First hour on site, troubleshooting", 135),
      L("Panel upgrade", "200-amp panel, breakers, grounding, inspection", 2400),
      L("GFCI outlets", "Kitchen and bath, installed", 85, 4),
      L("Ceiling fan installation", "Customer-supplied fan, existing box", 140, 1, true),
      L("Permit and inspection", "Billed at cost", 120),
    ],
  },
  "lawn-care": {
    message: "Thanks for having us out. Recurring visits are billed after each cut.",
    lines: [
      L("Mow, edge and blow", "Front and back, weekly service", 55, 4),
      L("Hedge trimming", "Front beds, clippings hauled", 120),
      L("Fertilization", "Spring application, granular", 85, 1, true),
      L("Mulch", "Hardwood mulch, installed, per yard", 95, 3, true),
    ],
  },
  roofing: {
    message: "Thank you for choosing us. Shingles carry the manufacturer's warranty; workmanship is guaranteed for five years.",
    lines: [
      L("Roof replacement", "Architectural shingles, tear-off, underlayment, ridge vent", 11800),
      L("Decking replacement", "Per sheet, if found during tear-off", 95, 4, true),
      L("Gutters", "Seamless aluminum, per linear foot", 9, 140, true),
      L("Permit", "City building permit, billed at cost", 150),
      L("Dumpster and haul-away", "Included in replacement", 0),
    ],
  },
  cleaning: {
    message: "Thank you for choosing us. Recurring cleans are billed after each visit.",
    lines: [
      L("Deep clean", "First visit, whole home, 3 bed / 2 bath", 320),
      L("Recurring clean", "Biweekly standard clean", 140, 2),
      L("Inside oven", "Add-on", 35, 1, true),
      L("Inside fridge", "Add-on", 35, 1, true),
      L("Interior windows", "Add-on, up to 15 panes", 60, 1, true),
    ],
  },
  "pressure-washing": {
    message: "Thank you for your business. Surfaces are pre-treated and rinsed; plants are covered and watered down.",
    lines: [
      L("Driveway and walkway", "Surface clean, up to 1,000 sq ft", 185),
      L("House wash", "Soft wash, two-story siding", 325),
      L("Deck or patio", "Clean and rinse", 150, 1, true),
      L("Roof soft wash", "Algae treatment, no pressure", 450, 1, true),
    ],
  },
  "pool-service": {
    message: "Thank you for your business. Weekly service is billed monthly; chemicals are included unless noted.",
    lines: [
      L("Weekly pool service", "Skim, brush, vacuum, chemical balance", 45, 4),
      L("Filter clean", "Cartridge filter, deep clean", 95),
      L("Pump motor replacement", "1.5 HP, installed", 620, 1, true),
      L("Salt cell cleaning", "Acid wash and inspection", 75, 1, true),
    ],
  },
  handyman: {
    message: "Thank you for your business. Materials are billed at cost plus the items listed.",
    lines: [
      L("Labor", "Hourly rate, two-hour minimum", 85, 3),
      L("Drywall patch and paint", "Two patches, texture matched", 180),
      L("TV mount", "Customer-supplied mount, up to 65 inches", 120, 1, true),
      L("Materials", "Receipts provided", 64.5),
    ],
  },
  "pest-control": {
    message: "Thank you for choosing us. Quarterly service includes a free re-treat between visits if needed.",
    lines: [
      L("Initial treatment", "Interior and exterior, whole home", 175),
      L("Quarterly service", "Exterior barrier treatment", 95, 1, true),
      L("Termite inspection", "Written report included", 85, 1, true),
      L("Rodent exclusion", "Seal entry points, bait stations", 350, 1, true),
    ],
  },
  "appliance-repair": {
    message: "Thank you for your business. Parts carry a 90-day warranty; the service call is credited toward the repair.",
    lines: [
      L("Service call", "Diagnosis, applied to the repair", 95),
      L("Washer drain pump", "Part and labor", 215),
      L("Dryer heating element", "Part and labor", 185, 1, true),
      L("Dryer vent cleaning", "Add-on while on site", 75, 1, true),
    ],
  },
  "garage-doors": {
    message: "Thank you for choosing us. Openers carry the manufacturer's warranty; our labor is guaranteed for one year.",
    lines: [
      L("Service call", "Inspection and tune-up", 89),
      L("Torsion spring replacement", "Pair, installed and balanced", 325),
      L("Opener, belt drive", "Installed, two remotes, keypad", 575, 1, true),
      L("Rollers", "Nylon rollers, set of ten", 140, 1, true),
    ],
  },
  "christmas-lights": {
    message: "Thank you for choosing us. The price includes install, one mid-season service call, and January takedown. Lights are ours and come down with us.",
    lines: [
      L("Roofline lights", "C9 warm white, per linear foot, installed", 6.5, 120),
      L("Tree wrap", "Mini lights, per tree", 150, 2),
      L("Wreaths and garland", "Front entry, lighted", 185, 1, true),
      L("Mid-season service", "Included", 0),
      L("Takedown", "January, included", 0),
    ],
  },
  "window-cleaning": {
    message: "Thank you for your business. Recurring visits are billed after each clean.",
    lines: [
      L("Exterior windows", "Two-story home, up to 30 panes", 165),
      L("Interior windows", "Same panes, inside", 110, 1, true),
      L("Screens", "Cleaned and reinstalled, each", 4, 18, true),
      L("Tracks and sills", "Add-on", 45, 1, true),
    ],
  },
  "junk-removal": {
    message: "Thank you for your business. Pricing is by load; items that need special disposal are listed separately.",
    lines: [
      L("Half load", "Up to 8 cubic yards, loaded and hauled", 325),
      L("Mattress", "Disposal fee", 45),
      L("Refrigerator", "Freon recovery and disposal", 85, 1, true),
      L("Same-day pickup", "Add-on", 50, 1, true),
    ],
  },
  painting: {
    message: "Thank you for choosing us. The price includes prep, two coats, and cleanup. A deposit holds the start date; the balance is due on completion.",
    lines: [
      L("Interior walls", "Three rooms, two coats, eggshell", 1650),
      L("Trim and doors", "Semi-gloss, same rooms", 480, 1, true),
      L("Ceilings", "Flat white, same rooms", 390, 1, true),
      L("Paint", "Premium interior, per gallon", 52, 8),
    ],
  },
  landscaping: {
    message: "Thank you for the opportunity. A deposit holds the start date; the balance is due when the work is complete.",
    lines: [
      L("Paver patio", "300 sq ft, base, pavers, edging, polymeric sand", 5400),
      L("Landscape lighting", "Six path lights and transformer", 1150, 1, true),
      L("Planting", "Shrubs and perennials per plan, installed", 980, 1, true),
      L("Sod", "Per pallet, installed", 285, 2),
    ],
  },
  "snow-removal": {
    message: "Thank you for your business. Per-push service is billed after each event; seasonal contracts are billed monthly November through March.",
    lines: [
      L("Driveway plow", "Per push, 2-inch trigger", 45, 3),
      L("Walkway and steps", "Shoveled, per visit", 25, 3),
      L("Salting", "Per application", 30, 2, true),
      L("Seasonal contract", "Unlimited pushes, monthly", 180, 1, true),
    ],
  },
};

/** Generic starting lines when there is no trade. */
export const GENERIC_TEMPLATE: TradeTemplate = {
  message: "Thank you for your business.",
  lines: [L("Service call", "First hour on site", 125), L("Labor", "Per additional hour", 85, 2), L("Materials", "Receipts provided", 60)],
};

export function templateForTrade(slug: string): TradeTemplate {
  return TRADE_TEMPLATES[slug] ?? GENERIC_TEMPLATE;
}

/** Every trade must have a template (checked by scripts/test-wb-site.ts). */
export function tradesWithTemplates(): Trade[] {
  return TRADES.filter((t) => Boolean(TRADE_TEMPLATES[t.slug]));
}
