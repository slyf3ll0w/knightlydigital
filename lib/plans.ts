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
 *                the dialer, voicemail, call notes. Includes a monthly
 *                text + minute allowance; usage past it bills per unit. A
 *                one-time setup fee covers buying the number and the
 *                carrier (10DLC) registration.
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
 * Entitlements: a company is on a plan when the superadmin console has
 * whitelisted it (Company.planGrants — the first users get everything free)
 * or, for Voice, when its Livery subscription is active
 * (Company.addonActiveAt, lib/addon.ts). Checkout for Pro and Max is
 * not wired yet; the grant is the only way onto them today. Nothing but the
 * phone line is gated in the app yet — see the plan doc for the gating
 * roll-out.
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
export const DISPATCH_TEXTS_INCLUDED = Math.round(envNum(process.env.PLAN_DISPATCH_TEXTS, 500));
export const DISPATCH_MINUTES_INCLUDED = Math.round(envNum(process.env.PLAN_DISPATCH_MINUTES, 500));
/** Per text and per minute past the allowance, in cents. */
export const DISPATCH_OVERAGE_CENTS = envNum(process.env.PLAN_DISPATCH_OVERAGE_CENTS, 3);

export const PLANS: Record<PlanId, Plan> = {
  DISPATCH: {
    id: "DISPATCH",
    name: "Voice",
    tagline: "Your own business phone line, inside WorkBench.",
    monthlyCents: Math.round(envNum(process.env.PLAN_DISPATCH_CENTS, 2_500)),
    comingSoon: false,
    includes: [
      "A local business number, registered to text in your name",
      "Calls ring in the app first, then your cell",
      "Browser dialer, hold, voicemail, and a full call log",
      "Text clients from the line; automatic texts send from it too",
      "Atlas call notes after every call",
      `${DISPATCH_TEXTS_INCLUDED.toLocaleString("en-US")} texts and ${DISPATCH_MINUTES_INCLUDED.toLocaleString("en-US")} minutes a month included`,
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
      "Route Manager",
      "Automations",
      "Agreements and contracts",
      "Live team map",
      "Timesheets and labor costing",
      "QuickBooks Online sync",
      "Atlas Full: 150,000 Atlas tokens a month",
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
  /** What it costs today: Voice + Pro, with Gallery joining at no extra charge for anyone already on it. */
  monthlyCents: Math.round(envNum(process.env.PLAN_FULL_SHOP_CENTS, 9_900)),
  /** What it will cost once Gallery ships and joins the bundle. */
  monthlyCentsAfterJobsite: Math.round(envNum(process.env.PLAN_FULL_SHOP_LATER_CENTS, 11_900)),
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
};

/** Is this company on the plan — whitelisted, or (Voice) subscribed? */
export function hasPlan(company: PlanHolder, plan: PlanId): boolean {
  if (company.planGrants.includes(plan)) return true;
  if (plan === "DISPATCH" && company.addonActiveAt) return true;
  return false;
}

/** Pro lifts the seat cap; everything else pays per extra user. */
export function hasUnlimitedSeats(company: PlanHolder): boolean {
  return hasPlan(company, "SHOP");
}

/** The plans a company is on, in catalog order. */
export function activePlans(company: PlanHolder): PlanId[] {
  return PLAN_IDS.filter((id) => hasPlan(company, id));
}

/** Only the ids the catalog knows, deduplicated, in catalog order. */
export function normalizeGrants(grants: readonly string[]): PlanId[] {
  return PLAN_IDS.filter((id) => grants.includes(id));
}
