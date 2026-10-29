import { ANNUAL_MONTHS, RATES, RATES_SENTENCE } from "@/lib/plans";
import { PAYMENT_GRACE_DAYS } from "@/lib/plan-entitlement";
/**
 * Plan names, prices and allowances for the Help Center, read from the same
 * constants as the pricing page (lib/plans, lib/atlas-pricing), so a price
 * change updates every guide. Keep plan wording here, not in the guides.
 */
import {
  DISPATCH_OVERAGE_CENTS,
  DISPATCH_SETUP_CENTS,
  EXTRA_SEAT_CENTS,
  FAIR_USE_FORBIDDEN,
  FAIR_USE_MINUTES_LABEL,
  FAIR_USE_SENTENCE,
  FAIR_USE_TEXTS_LABEL,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  formatCents,
  formatUnitCents,
} from "../plans";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_PRICE_CENTS, ATLAS_PLAN_TOKENS } from "../atlas-pricing";
import type { HelpBlock } from "./types";

const n = (x: number) => x.toLocaleString("en-US");

export const CORE = FREE_PLAN_NAME;
export const PRO = PLANS.SHOP.name;
export const PRO_PRICE = `${formatCents(PLANS.SHOP.monthlyCents)}/month`;
export const VOICE = PLANS.DISPATCH.name;
export const VOICE_PRICE = `${formatCents(PLANS.DISPATCH.monthlyCents)}/month`;
export const MAX = FULL_SHOP.name;
export const MAX_PRICE = `${formatCents(FULL_SHOP.monthlyCents)}/month`;
export const GALLERY = PLANS.JOBSITE.name;
export const GALLERY_PRICE = `${formatCents(PLANS.JOBSITE.monthlyCents)}/month`;
export const VOICE_SETUP = formatCents(DISPATCH_SETUP_CENTS);
/** "$35" — the monthly price alone (VOICE_PRICE carries "/month"). */
export const VOICE_MONTHLY = formatCents(PLANS.DISPATCH.monthlyCents);
/** "3,000" each — the fair-use ceiling that defines unlimited. */
export const VOICE_FAIR_USE_TEXTS = FAIR_USE_TEXTS_LABEL;
export const VOICE_FAIR_USE_MINUTES = FAIR_USE_MINUTES_LABEL;
/** "3¢" — per text or minute past the fair-use ceiling. */
export const VOICE_OVERAGE = formatUnitCents(DISPATCH_OVERAGE_CENTS);
/** The fair-use promise, worded once (lib/plans). */
export const VOICE_FAIR_USE = FAIR_USE_SENTENCE;
export const VOICE_FAIR_USE_FORBIDDEN = FAIR_USE_FORBIDDEN;
/** One line for Settings and guides: what you get. */
export const VOICE_UNLIMITED_LINE = "Unlimited talk and text for normal business use.";

export const SEATS_INCLUDED = INCLUDED_SEATS;
export const EXTRA_SEAT = `${formatCents(EXTRA_SEAT_CENTS)}/month`;
/** "$10/mo" — as the Plans page prints it on the Add a person button. */
export const EXTRA_SEAT_MO = `${formatCents(EXTRA_SEAT_CENTS)}/mo`;

/**
 * In-app one-liners about seats and the free core (Team page, signup doors,
 * the Voice page). Built here so they can never contradict the pricing page.
 */
export const SEATS_SENTENCE = `${CORE} includes ${SEATS_INCLUDED} people. Each extra person is ${EXTRA_SEAT}; ${PRO} and ${MAX} have no per-person charge.`;
export const CORE_FREE_LINE = `${CORE} is free for up to ${SEATS_INCLUDED} people — no card needed.`;
export const CORE_SEATS_LINE = `${CORE} is free for ${SEATS_INCLUDED} people; each extra person is ${EXTRA_SEAT}.`;

export const ATLAS_FREE = n(ATLAS_FREE_TOKENS);
export const ATLAS_FULL = n(ATLAS_PLAN_TOKENS);
export const ATLAS_FULL_PRICE = `${formatCents(ATLAS_PLAN_PRICE_CENTS)}/month`;

/** Chips on a guide's header. */
export const PRO_CHIP = `${PRO} plan · ${formatCents(PLANS.SHOP.monthlyCents)}/mo`;
export const VOICE_CHIP = `${VOICE} plan · ${formatCents(PLANS.DISPATCH.monthlyCents)}/mo`;

/** Where plans are bought and managed (Settings → Plans). */
export const PLANS_PAGE = "/app/settings/plans";
export const PLANS_PAGE_LINK = `[Settings → Plans](${PLANS_PAGE})`;

/** How a Pro/Max account gets switched on: self-serve, with us as the fallback. */
export const HOW_TO_ADD_PRO = `The account owner adds it on ${PLANS_PAGE_LINK}: pick **Monthly** or **Annual**, add a card, done (see [Manage your plan](/help/manage-your-plan)). Or message us from the Help Center and we switch it on for you.`;

/** "10 months' price for 12 months (two months free)" — the annual term. */
export const ANNUAL_TERM = `${ANNUAL_MONTHS} months' price for 12 months (two months free)`;

/** Days a renewal can go unpaid before the plan's features pause (lib/plan-entitlement). */
export const PAYMENT_GRACE = `${PAYMENT_GRACE_DAYS} days`;

/**
 * Where a company's plan invoices, receipts and card live: its client hub in
 * the WorkBench account, linked from the bottom of Settings → Plans. Plans are
 * billed by WorkBench itself (lib/plan-billing.ts), never by Square directly.
 */
export const BILLING_PAGE = "**your billing page** (the link at the bottom of Settings → Plans)";
export const BILLED_BY_LINE = `Plans are billed by WorkBench — the same way you bill a client's recurring plan — to the card on file. Every charge is a WorkBench invoice, and the invoices, receipts and the card are on ${BILLING_PAGE}.`;

/**
 * What a Core account sees on a Pro feature once it's locked — the one
 * sentence every gated guide and the plans guide share.
 */
export const PRO_GATE_LINE = `On ${CORE} the page shows a card saying it's part of ${PRO}, with a \`See plans\` button; the menu marks it with a small **${PRO}** chip, and an action that needs ${PRO} answers with a message that links to Plans.`;

/**
 * The "Good to know" line for the first guide of a Pro feature: what the
 * plan costs, what else is in it, that Max includes it too, and where to
 * add it.
 */
export function proTip(feature: string): HelpBlock {
  return {
    type: "tip",
    text: `${feature} ${feature.endsWith("s") ? "are" : "is"} part of the **${PRO}** plan (${PRO_PRICE}), along with unlimited people, estimate tools, Route Manager (beta), automations, agreements, the team map, timesheets, QuickBooks sync, tasks for your team, team sticky notes, and ${ATLAS_FULL} Atlas tokens a month. **${MAX}** (${MAX_PRICE}) includes ${PRO} and ${VOICE} together. The owner adds either on ${PLANS_PAGE_LINK}. See [Plans and pricing](/help/plans-and-pricing).`,
  };
}

/**
 * The short form, for the second and later guides of the same feature:
 * one line, the plan, where to add it.
 */
export function proLine(feature: string): HelpBlock {
  return {
    type: "tip",
    text: `${feature} ${feature.endsWith("s") ? "are" : "is"} part of **${PRO}** (${PRO_PRICE}; also in **${MAX}**). The owner adds it on ${PLANS_PAGE_LINK} — see [Plans and pricing](/help/plans-and-pricing).`,
  };
}

// Payment processing (lib/plans.ts PROCESSING_RATES): company-paid vs the
// service fee the client pays.
export const RATE_CARD = RATES.companyPaid.card;
export const RATE_ACH = RATES.companyPaid.ach;
export const FEE_CARD = RATES.serviceFee.card;
export const FEE_CARD_PCT = RATES.serviceFee.cardPct;
export const FEE_ACH = RATES.serviceFee.ach;
export const RATES_LINE = RATES_SENTENCE;
