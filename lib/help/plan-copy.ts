/**
 * Plan names, prices and allowances for the Help Center, read from the same
 * constants as the pricing page (lib/plans, lib/atlas-pricing), so a price
 * change updates every guide. Keep plan wording here, not in the guides.
 */
import {
  DISPATCH_SETUP_CENTS,
  EXTRA_SEAT_CENTS,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  formatCents,
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

export const SEATS_INCLUDED = INCLUDED_SEATS;
export const EXTRA_SEAT = `${formatCents(EXTRA_SEAT_CENTS)}/month`;

export const ATLAS_FREE = n(ATLAS_FREE_TOKENS);
export const ATLAS_FULL = n(ATLAS_PLAN_TOKENS);
export const ATLAS_FULL_PRICE = `${formatCents(ATLAS_PLAN_PRICE_CENTS)}/month`;

/** Chips on a guide's header. */
export const PRO_CHIP = `${PRO} plan · ${formatCents(PLANS.SHOP.monthlyCents)}/mo`;
export const VOICE_CHIP = `${VOICE} plan · ${formatCents(PLANS.DISPATCH.monthlyCents)}/mo`;

/** How a Pro/Max account gets switched on (no self-serve checkout yet). */
export const HOW_TO_ADD_PRO = `Call or email us and we switch it on for you.`;

/**
 * The "Good to know" line for the first guide of a Pro feature: what the
 * plan costs, what else is in it, and that Max includes it too.
 */
export function proTip(feature: string): HelpBlock {
  return {
    type: "tip",
    text: `${feature} ${feature.endsWith("s") ? "are" : "is"} part of the **${PRO}** plan (${PRO_PRICE}), along with unlimited users, estimate tools, Route Manager, automations, agreements, the team map, timesheets, QuickBooks sync, and ${ATLAS_FULL} Atlas tokens a month. **${MAX}** (${MAX_PRICE}) includes ${PRO} and ${VOICE} together. See [Plans and pricing](/help/plans-and-pricing).`,
  };
}
