import { ATLAS_PLAN_TOKENS } from "./atlas-pricing";
/**
 * WorkBench plans — the one catalog the marketing site, the app, and the
 * superadmin console all read, so a price or a plan name can never drift
 * between the pricing page and what a company is actually entitled to.
 *
 * The model (decided 2026-09-25, docs/plans/pricing-plans-2026-09-25.md):
 *
 *   Core       — the free core. Full access, not a trial: clients, booking,
 *                scheduling, quotes, invoices, payments, portal, chat, Atlas
 *                free tokens. 2 users included; extra users EXTRA_SEAT a
 *                month each. Funded by payment processing.
 * Display names changed 2026-09-25 (Dispatch → Voice, Shop → Pro, Jobsite →
 * Gallery, Full Shop → Max); the PlanId values, constants and env vars keep
 * the old names because they are stored in Company.planGrants.
 *
 *   Voice (id DISPATCH) — the business phone line (lib/business-line.ts): a local
 *                number, texting registration, calls that ring in the app,
 *                the dialer, voicemail, call notes. Unlimited talk and text
 *                for normal business use (US + Canada), defined by a
 *                fair-use ceiling (DISPATCH_FAIR_USE_*) past which usage
 *                bills per unit. A one-time setup fee covers buying the
 *                number and the carrier (10DLC) registration.
 *   Pro (id SHOP) — unlimited users plus the ops tools: Estimator + Library,
 *                Route Manager, Automations, Agreements, Team map,
 *                Timesheets, QuickBooks Online, and Atlas Full's tokens.
 *   Gallery (id JOBSITE) — CompanyCam-style job photos. COMING SOON — shown on the
 *                site, not sold.
 *   Max (FULL_SHOP) — every add-on together. Priced as Voice + Pro while
 *                Gallery is unshipped; goes up when Gallery joins, and
 *                anyone already on it keeps the launch price.
 *
 * Annual billing on every add-on = 10 × the monthly price (two months free).
 *
 * Entitlements (2026-10-28, docs/plans/plan-gating-square-billing-2026-10-28.md):
 * a company is on a plan when the superadmin console has whitelisted it
 * (Company.planGrants — comped accounts), when it PAYS for it through
 * WorkBench's Square account (Company.paidPlans, kept in step with its
 * the company's recurring series in the WorkBench account by lib/plan-billing.ts; Max pays for every plan at
 * once), or, for Voice, when its legacy Livery subscription is active
 * (Company.addonActiveAt, lib/addon.ts). Feature gates (featureAllowed) are
 * dark until PLAN_GATING=1; once live, TEST accounts (Company.isTest) pass
 * every gate — only Voice still needs a grant or a subscription, because a
 * phone number costs real money — and every live account needs the plan.
 *
 * Prices are env-tunable (cents) so a price change is a Railway variable,
 * not a deploy; the site reads these constants, never its own numbers.
 */

const envNum = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The purchasable add-ons — what a company can be granted or subscribe to. */
export type PlanId = "DISPATCH" | "SHOP" | "JOBSITE";
export const PLAN_IDS: readonly PlanId[] = ["DISPATCH", "SHOP", "JOBSITE"] as const;

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
}

/** The free core. */
export const FREE_PLAN_NAME = "Core";
/** Users included with the free core (and with any add-on that isn't Pro). */
export const INCLUDED_SEATS = Math.round(envNum(process.env.PLAN_INCLUDED_SEATS, 2));
/** Each user past the included seats, per month, on any plan without Pro. */
export const EXTRA_SEAT_CENTS = Math.round(envNum(process.env.PLAN_EXTRA_SEAT_CENTS, 1_000));

/** Months paid for on an annual term — 10 of 12, i.e. two months free. */
export const ANNUAL_MONTHS = 10;

export type Plan = {
  id: PlanId;
  name: string;
  /** One line under the name. */
  tagline: string;
  monthlyCents: number;
  /** Not yet sold: shown on the site with a "Coming soon" chip, never granted by checkout. */
  comingSoon: boolean;
  /** Bullet list for the pricing card, in order. */
  includes: string[];
};

export const DISPATCH_SETUP_CENTS = Math.round(envNum(process.env.PLAN_DISPATCH_SETUP_CENTS, 2_500));
/**
 * Voice is unlimited talk and text for normal business use (decided
 * 2026-10-28 with the move from $25 to $35; it replaced a 500-text /
 * 500-minute allowance). The fair-use ceiling is what "unlimited" means in
 * the Terms: past it in a month, usage bills per unit at
 * DISPATCH_OVERAGE_CENTS. Set where no real shop meets it (a busy
 * three-truck shop runs a few hundred of each) but an auto-dialer or a text
 * blaster does — which the carriers' 10DLC registration forbids on these
 * lines anyway. Metering: texts already count in CompanyUsageDaily; minutes
 * roll up from Call.durationSec. Neither bills yet (pricing plan doc, item 3).
 */
export const DISPATCH_FAIR_USE_TEXTS = Math.round(envNum(process.env.PLAN_DISPATCH_FAIR_USE_TEXTS, 3_000));
export const DISPATCH_FAIR_USE_MINUTES = Math.round(envNum(process.env.PLAN_DISPATCH_FAIR_USE_MINUTES, 3_000));
/** Per text and per minute past the fair-use ceiling, in cents. */
export const DISPATCH_OVERAGE_CENTS = envNum(process.env.PLAN_DISPATCH_OVERAGE_CENTS, 3);

export const PLANS: Record<PlanId, Plan> = {
  DISPATCH: {
    id: "DISPATCH",
    name: "Voice",
    tagline: "Your own business phone line, inside WorkBench.",
    monthlyCents: Math.round(envNum(process.env.PLAN_DISPATCH_CENTS, 3_500)),
    comingSoon: false,
    includes: [
      "A local business number, registered to text in your name",
      "Calls ring in the app first, then your cell",
      "Browser dialer, hold, voicemail, and a full call log",
      "Text clients from the line; automatic texts send from it too",
      "Atlas call notes after every call",
      "Unlimited talk and text for normal business use",
    ],
  },
  SHOP: {
    id: "SHOP",
    name: "Pro",
    tagline: "Unlimited users and the tools that run a growing crew.",
    monthlyCents: Math.round(envNum(process.env.PLAN_SHOP_CENTS, 8_900)),
    comingSoon: false,
    includes: [
      "Unlimited users, every role",
      "Estimator and the Estimator Library",
      "Route Manager (beta)",
      "Automations",
      "Agreements and contracts",
      "Live team map",
      "Timesheets and labor costing",
      "QuickBooks Online sync",
      "Tasks you can hand to your team",
      "Team sticky notes everyone sees",
      `Atlas Full: ${ATLAS_PLAN_TOKENS.toLocaleString("en-US")} Atlas tokens a month`,
    ],
  },
  JOBSITE: {
    id: "JOBSITE",
    name: "Gallery",
    tagline: "Job photos your clients and crew can trust.",
    monthlyCents: Math.round(envNum(process.env.PLAN_JOBSITE_CENTS, 2_900)),
    comingSoon: true,
    includes: [
      "Photos stamped with who, when, and where",
      "Before-and-after pairs and markup",
      "A photo feed per job and per company",
      "Client gallery with a share link",
      "Photo report PDF on any job",
      "Works offline; uploads when the truck has signal",
    ],
  },
};

/** Every add-on together. */
export const FULL_SHOP = {
  name: "Max",
  tagline: "Every add-on, one price.",
  /**
   * What it costs today: Voice + Pro, with Gallery joining at no extra charge
   * for anyone already on it. $99 → $109 on 2026-10-28, following Voice's
   * $25 → $35 (David: Max keeps the same $15 discount against the pair).
   */
  monthlyCents: Math.round(envNum(process.env.PLAN_FULL_SHOP_CENTS, 10_900)),
  /** What it will cost once Gallery ships and joins the bundle ($119 → $129, same step). */
  monthlyCentsAfterJobsite: Math.round(envNum(process.env.PLAN_FULL_SHOP_LATER_CENTS, 12_900)),
} as const;

/** The plans Max bundles — every add-on, whether shipped yet or not. */
export const FULL_SHOP_PLANS: readonly PlanId[] = PLAN_IDS;

export function annualCents(monthlyCents: number): number {
  return monthlyCents * ANNUAL_MONTHS;
}

/** "$25" / "$20.83" — a price as marketing writes it. */
export function formatCents(cents: number): string {
  const whole = Math.round(cents) % 100 === 0;
  return whole ? `$${Math.round(cents) / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** "3¢" / "$1.50" — a per-unit price. */
export function formatUnitCents(cents: number): string {
  return cents < 100 ? `${cents % 1 === 0 ? cents : cents.toFixed(1)}¢` : formatCents(cents);
}

/** "3,000" — a fair-use count as copy prints it. */
export const FAIR_USE_TEXTS_LABEL = DISPATCH_FAIR_USE_TEXTS.toLocaleString("en-US");
export const FAIR_USE_MINUTES_LABEL = DISPATCH_FAIR_USE_MINUTES.toLocaleString("en-US");

/**
 * What "unlimited" means on Voice — the one sentence the pricing card, the
 * FAQ, Help, Settings → Voice and the Terms all print, so the promise can
 * never be worded two ways.
 */
export const FAIR_USE_SENTENCE = `Unlimited covers normal business use in the US and Canada: up to ${FAIR_USE_TEXTS_LABEL} texts and ${FAIR_USE_MINUTES_LABEL} minutes a month per company. Past that, each text or minute is ${formatUnitCents(DISPATCH_OVERAGE_CENTS)}.`;
/** The second half: what a WorkBench line is not for. */
export const FAIR_USE_FORBIDDEN = "Auto-dialers, bulk or marketing blasts, and call-center use aren't allowed on a WorkBench line.";

/**
 * Sum of the shipped add-ons bought separately, monthly — what Max is
 * discounted against on the pricing page.
 */
export function separatelyMonthlyCents(): number {
  return PLAN_IDS.filter((id) => !PLANS[id].comingSoon).reduce((sum, id) => sum + PLANS[id].monthlyCents, 0);
}

// ── Entitlements ──

/** The Company fields an entitlement check reads. */
export type PlanHolder = {
  planGrants: string[];
  /** Voice's paid entitlement (lib/addon.ts) — the Livery subscription, or a manual grant. */
  addonActiveAt?: Date | null;
  /** Plans paid for through WorkBench itself (lib/plan-billing.ts syncs it from the recurring series on the company's client record). */
  paidPlans?: readonly string[];
  /** Extra people paid for a month at a time (one SEAT subscription each). */
  paidSeats?: number;
  /** Superadmin "Test" flag: passes every feature gate except Voice. */
  isTest?: boolean;
};

/** The Company columns every entitlement check reads — spread into selects. */
export const PLAN_HOLDER_SELECT = {
  planGrants: true,
  paidPlans: true,
  paidSeats: true,
  addonActiveAt: true,
  isTest: true,
} as const;

/** Is this company on the plan — whitelisted, or (Voice) subscribed? */
export function hasPlan(company: PlanHolder, plan: PlanId): boolean {
  if (company.planGrants.includes(plan)) return true;
  if (company.paidPlans?.includes(plan)) return true;
  if (plan === "DISPATCH" && company.addonActiveAt) return true;
  return false;
}

/** How the company is on the plan: a superadmin grant, a Square subscription, the legacy Livery one — or not at all. */
export type PlanSource = "grant" | "paid" | "livery" | null;
export function planSource(company: PlanHolder, plan: PlanId): PlanSource {
  if (company.planGrants.includes(plan)) return "grant";
  if (company.paidPlans?.includes(plan)) return "paid";
  if (plan === "DISPATCH" && company.addonActiveAt) return "livery";
  return null;
}

/** Pro lifts the seat cap; everything else pays per extra user. */
export function hasUnlimitedSeats(company: PlanHolder): boolean {
  return hasPlan(company, "SHOP");
}

/** The plans a company is on, in catalog order. */
export function activePlans(company: PlanHolder): PlanId[] {
  return PLAN_IDS.filter((id) => hasPlan(company, id));
}

// ── Seats ──

/**
 * How many active people the company may have, or null for no limit (Pro /
 * Max, a test account, or the gate still dark). Core: INCLUDED_SEATS plus
 * every seat paid for.
 */
export function seatLimit(company: PlanHolder, live: boolean = planGatingLive()): number | null {
  if (!live || company.isTest || hasUnlimitedSeats(company)) return null;
  return INCLUDED_SEATS + Math.max(0, company.paidSeats ?? 0);
}

/** May one more active person join, given how many are active now? */
export function canAddPerson(company: PlanHolder, activePeople: number, live: boolean = planGatingLive()): boolean {
  const limit = seatLimit(company, live);
  return limit === null || activePeople < limit;
}

// ── What can be bought (lib/plan-billing.ts sells these through Square) ──

/** A plan, the Max bundle, or one extra person. */
export type BillingProduct = PlanId | "FULL_SHOP" | "SEAT";
export const BILLING_PRODUCTS: readonly BillingProduct[] = ["DISPATCH", "SHOP", "JOBSITE", "FULL_SHOP", "SEAT"] as const;
export type BillingCadence = "MONTHLY" | "ANNUAL";

export function isBillingProduct(v: unknown): v is BillingProduct {
  return typeof v === "string" && (BILLING_PRODUCTS as readonly string[]).includes(v);
}

/** The plans a paid product puts the company on (a seat puts it on none). */
export function productPlans(product: BillingProduct): PlanId[] {
  if (product === "FULL_SHOP") return [...FULL_SHOP_PLANS];
  if (product === "SEAT") return [];
  return [product];
}

export function productName(product: BillingProduct): string {
  if (product === "FULL_SHOP") return FULL_SHOP.name;
  if (product === "SEAT") return "Extra person";
  return PLANS[product].name;
}

/** What a product costs per term, in cents (annual = ANNUAL_MONTHS × monthly; seats are monthly only). */
export function productPriceCents(product: BillingProduct, cadence: BillingCadence): number {
  const monthly =
    product === "FULL_SHOP" ? FULL_SHOP.monthlyCents : product === "SEAT" ? EXTRA_SEAT_CENTS : PLANS[product].monthlyCents;
  return cadence === "ANNUAL" ? annualCents(monthly) : monthly;
}

/** Sold today? Gallery is coming soon; everything else is. */
export function productSellable(product: BillingProduct): boolean {
  if (product === "FULL_SHOP" || product === "SEAT") return true;
  return !PLANS[product].comingSoon;
}

/** Only the ids the catalog knows, deduplicated, in catalog order. */
export function normalizeGrants(grants: readonly string[]): PlanId[] {
  return PLAN_IDS.filter((id) => grants.includes(id));
}

// ── Feature gates ──

/**
 * The Pro features that carry a gate in code — the whole Pro card
 * (PLANS.SHOP.includes), one id per feature. Each one names its own copy.
 */
export type GatedFeature =
  | "routes"
  | "task_assign"
  | "team_notes"
  | "estimator"
  | "automations"
  | "agreements"
  | "team_map"
  | "timesheets"
  | "quickbooks"
  | "seats";

export const GATED_FEATURES: readonly GatedFeature[] = [
  "routes",
  "task_assign",
  "team_notes",
  "estimator",
  "automations",
  "agreements",
  "team_map",
  "timesheets",
  "quickbooks",
  "seats",
] as const;

const FEATURE_LABEL: Record<GatedFeature, string> = {
  routes: "Route Manager (beta)",
  // Tasks & sticky notes (docs/plans/tasks-schedule-send-sticky-notes-2026-10-03.md):
  // personal tasks and notes are free; handing tasks to employees and
  // team sticky notes sit with the other team tools.
  task_assign: "Giving tasks to your team",
  team_notes: "Team sticky notes",
  estimator: "The Estimator",
  automations: "Automations",
  agreements: "Agreements and contracts",
  team_map: "The live team map",
  timesheets: "Timesheets and labor costing",
  quickbooks: "QuickBooks Online sync",
  seats: "More than the included people",
};

/** One line of what the feature does, for the upsell card. */
const FEATURE_BLURB: Record<GatedFeature, string> = {
  routes: "Every stop on a map, drive times between them, one-tap route optimizing, and Find a Time when you book.",
  task_assign: "Hand tasks to anyone on the team and see everyone's open work in one list.",
  team_notes: "Sticky notes the whole team sees, on the dashboard and on the phone.",
  estimator: "Build estimates from your own price book with the Estimator and its Library of saved assemblies.",
  automations: "Zapier-style automations: when something happens in WorkBench, do the next thing for you.",
  agreements: "Service agreements and contracts your clients sign online.",
  team_map: "See where everyone on the clock is right now.",
  timesheets: "Clock in and out on jobs, weekly timesheets, and labor cost on every job's margin.",
  quickbooks: "Customers, invoices, payments and estimates synced to QuickBooks Online every night.",
  seats: `Core includes ${INCLUDED_SEATS} people. Add a person for ${formatCents(EXTRA_SEAT_CENTS)} a month, or go Pro for unlimited people.`,
};

export function featureLabel(feature: GatedFeature): string {
  return FEATURE_LABEL[feature];
}

export function featureBlurb(feature: GatedFeature): string {
  return FEATURE_BLURB[feature];
}

/** The plan that unlocks a feature. Every gated feature is Pro today. */
export function featurePlan(_feature: GatedFeature): PlanId {
  return "SHOP";
}

/**
 * Gates ship dark and switch on together: PLAN_GATING=1 on Railway once the
 * first accounts are whitelisted (the plan doc's roll-out order). Until
 * then every feature check answers "allowed", exactly as today.
 */
export function planGatingLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.PLAN_GATING === "1";
}

/**
 * May this company use the feature right now? Dark gate = yes. A test
 * account = yes (David 2026-10-28: test accounts have everything open except
 * Voice, which is not a GatedFeature — the phone line gates on hasAddon /
 * hasPlan DISPATCH in lib/business-line.ts). Otherwise: on the plan.
 */
export function featureAllowed(company: PlanHolder, feature: GatedFeature, live: boolean = planGatingLive()): boolean {
  if (!live) return true;
  if (company.isTest) return true;
  return hasPlan(company, featurePlan(feature));
}

// ── Payment processing rates (decided 2026-10-22) ──────────────────────────

/**
 * Two ways a company can pay for card and ACH processing — the one source
 * the pricing page, the Help Center, the app's fee estimates and the
 * Settings default read. Company-paid: the business absorbs the fee.
 * Service fee: the client pays it at checkout and the business receives the
 * full invoice amount. ACH fees are capped both ways.
 */
export type ProcessingRate = {
  cardBps: number;
  cardFixedCents: number;
  achBps: number;
  achMinCents: number;
  achMaxCents: number;
};

export const PROCESSING_RATES: { companyPaid: ProcessingRate; serviceFee: ProcessingRate } = {
  companyPaid: { cardBps: 295, cardFixedCents: 30, achBps: 70, achMinCents: 100, achMaxCents: 800 },
  serviceFee: { cardBps: 350, cardFixedCents: 30, achBps: 75, achMinCents: 100, achMaxCents: 800 },
};

function pctLabel(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function wholeDollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);
}

/** "2.95% + 30¢" */
export function cardRateLabel(r: ProcessingRate): string {
  return `${pctLabel(r.cardBps)} + ${r.cardFixedCents}¢`;
}
/** "0.70% ($1 minimum, $8 maximum)" */
export function achRateLabel(r: ProcessingRate): string {
  return `${pctLabel(r.achBps)} (${wholeDollars(r.achMinCents)} minimum, ${wholeDollars(r.achMaxCents)} maximum)`;
}
/** "0.70%, $1–$8" */
export function achRateShort(r: ProcessingRate): string {
  return `${pctLabel(r.achBps)}, ${wholeDollars(r.achMinCents)}–${wholeDollars(r.achMaxCents)}`;
}

export const RATES = {
  companyPaid: {
    card: cardRateLabel(PROCESSING_RATES.companyPaid),
    cardPct: pctLabel(PROCESSING_RATES.companyPaid.cardBps),
    ach: achRateLabel(PROCESSING_RATES.companyPaid),
    achShort: achRateShort(PROCESSING_RATES.companyPaid),
  },
  serviceFee: {
    card: cardRateLabel(PROCESSING_RATES.serviceFee),
    cardPct: pctLabel(PROCESSING_RATES.serviceFee.cardBps),
    ach: achRateLabel(PROCESSING_RATES.serviceFee),
    achShort: achRateShort(PROCESSING_RATES.serviceFee),
  },
};

/** The full statement, for the pricing page and FAQs. */
export const RATES_SENTENCE = `Two ways to pay for processing. Company-paid: ${RATES.companyPaid.card} per card transaction and ${RATES.companyPaid.ach} per ACH bank transfer. Or add a service fee your client pays at checkout — ${RATES.serviceFee.card} per card transaction and ${RATES.serviceFee.ach} per ACH bank transfer — and you receive the full invoice amount. No monthly fees, no volume minimums, no charge on failed payments.`;
/** The short form, for feature bullets and meta descriptions. */
export const RATES_SHORT = `${RATES.companyPaid.card} per card transaction and ${RATES.companyPaid.achShort} per ACH transfer company-paid, or a client service fee of ${RATES.serviceFee.card} card and ${RATES.serviceFee.achShort} ACH`;
