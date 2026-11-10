import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, PLANS, RATES_SHORT, formatCents } from "@/lib/plans";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";

/**
 * The /vs/<competitor> comparison tables and intros, as data: the pages
 * (app/(wbsite)/vs/*) render them and the Markdown twins for AI agents
 * (/vs/<competitor>.md, lib/wb-markdown.ts) print the same rows, so the two
 * can never disagree. Keep rows factual and hedge anything about the
 * competitor's prices; every WorkBench number comes from lib/plans.
 */
export type VsRow = { label: string; workbench: string; competitor: string };
export type VsPage = { slug: string; name: string; intro: string; rows: VsRow[] };

const seats = INCLUDED_SEATS;
const seatPrice = formatCents(EXTRA_SEAT_CENTS);
const voicePrice = formatCents(PLANS.DISPATCH.monthlyCents);
const proPrice = formatCents(PLANS.SHOP.monthlyCents);
const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const planPrice = formatPlanPrice();

const jobber: VsPage = {
  slug: "jobber",
  name: "Jobber",
  intro: `Jobber and WorkBench both run scheduling, quoting, invoicing, and payments for home-service teams. The difference is the pricing model: Jobber is a per-user monthly subscription; WorkBench is free core software (full access for ${seats} users, not a trial) with flat-priced optional add-ons, funded mostly by a flat percentage of the payments you process through it.`,
  rows: [
    {
      label: "Pricing model",
      workbench: `Free core software with full access for ${seats} users, not a trial. Optional flat-priced add-ons per company, from ${voicePrice} a month: ${PLANS.DISPATCH.name} (a business phone line), ${PLANS.SHOP.name} (unlimited users and the ops tools, ${proPrice}), and ${PLANS.JOBSITE.name} (job photos, coming soon). WorkBench also earns on processing when a client pays through it (${RATES_SHORT}), and nothing is charged if you never process a payment.`,
      competitor: "A monthly subscription with multiple pricing tiers, typically priced per user. Check jobber.com for current plans.",
    },
    {
      label: "Seats / users",
      workbench: `${seats} included free, ${seatPrice} a month each after that, or unlimited with the ${PLANS.SHOP.name} add-on — owner, admin, sales, and tech roles on every plan.`,
      competitor: "Higher tiers generally unlock more users; adding seats can move you to a higher tier.",
    },
    {
      label: "Payments",
      workbench: "Card and ACH built in at one flat rate across invoices, quotes, and bookings, about what Jobber Payments charges — the difference is there's no subscription underneath it. The pricing page has the exact numbers and a side-by-side estimate.",
      competitor: "Offers built-in payment processing (Jobber Payments) with its own published rates — compare directly on their site.",
    },
    {
      label: "Client portal",
      workbench: "A no-login, magic-link hub: invoices, agreements, messaging, and request-more-work in one place.",
      competitor: "Offers a client hub with similar self-serve capabilities.",
    },
    {
      label: "AI assistant",
      workbench: `Atlas — a built-in assistant you can talk to hands-free (or type to) that schedules, quotes, invoices, and messages on your behalf, always with a confirmation step. ${freeTokens} free tokens every month; Atlas Full is ${planPrice}/month for ${planTokens}.`,
      competitor: "Has been rolling out AI features; check their current feature list for scope.",
    },
    {
      label: "Mobile app",
      workbench: "Native iPhone app on the App Store, with offline schedule viewing on the job site.",
      competitor: "Has native iOS and Android apps with field-service functionality.",
    },
    {
      label: "Onboarding",
      workbench: "Self-serve: the account opens the day you sign up. Card and bank payments switch on once you connect Square, which takes a few minutes.",
      competitor: "Self-serve signup with a free trial period.",
    },
  ],
};

const housecallPro: VsPage = {
  slug: "housecall-pro",
  name: "Housecall Pro",
  intro: `Housecall Pro and WorkBench both run scheduling, dispatch, invoicing, and payments for home-service teams. The structural difference is pricing: Housecall Pro is a per-user monthly subscription with tiered add-ons; WorkBench is free core software (full access for ${seats} users, not a trial) with flat-priced optional add-ons, funded mostly by a flat percentage of the payments you process through it.`,
  rows: [
    {
      label: "Pricing model",
      workbench: `Free core software with full access for ${seats} users, not a trial. Optional flat-priced add-ons per company, from ${voicePrice} a month: ${PLANS.DISPATCH.name} (a business phone line), ${PLANS.SHOP.name} (unlimited users and the ops tools, ${proPrice}), and ${PLANS.JOBSITE.name} (job photos, coming soon). WorkBench also earns on processing when a client pays through it: ${RATES_SHORT}.`,
      competitor: "A monthly subscription across multiple tiers, typically priced per user with add-ons for extra capabilities. Check housecallpro.com for current plans.",
    },
    {
      label: "Seats / users",
      workbench: `${seats} included free, ${seatPrice} a month each after that, or unlimited with the ${PLANS.SHOP.name} add-on — owner, admin, sales, and tech roles on every plan.`,
      competitor: "User limits and pricing generally scale with the plan tier.",
    },
    {
      label: "Payments",
      workbench: "Card and ACH built in at one flat, published rate, about what you pay for online card payments anywhere — the difference is there's no subscription underneath it. The pricing page has the exact numbers and a side-by-side estimate.",
      competitor: "Offers built-in payment processing with its own published rates — compare directly on their site.",
    },
    {
      label: "Lead / booking intake",
      workbench: "Embeddable booking widget, a lead pipeline board, and a generic webhook for Zapier/Make/ad platforms.",
      competitor: "Has a consumer-facing marketplace (Housecall Pro app) that can generate leads directly, alongside its own booking tools.",
    },
    {
      label: "Team chat",
      workbench: "Built-in company channel, DMs, and group threads with push notifications, included free.",
      competitor: "Offers team communication features as part of its platform.",
    },
    {
      label: "AI assistant",
      workbench: `Atlas — talk to it hands-free or type; it schedules, quotes, invoices, and messages on request, always with a confirmation step. ${freeTokens} free tokens every month; Atlas Full is ${planPrice}/month for ${planTokens}.`,
      competitor: "Check their current feature list for AI capabilities and availability.",
    },
    {
      label: "Onboarding",
      workbench: "Self-serve: the account opens the day you sign up. Card and bank payments switch on once you connect Square, which takes a few minutes.",
      competitor: "Self-serve signup with a free trial period.",
    },
  ],
};

const servicetitan: VsPage = {
  slug: "servicetitan",
  name: "ServiceTitan",
  intro: "ServiceTitan and WorkBench both run home-service operations, but at different scales. ServiceTitan is a deep enterprise platform with custom pricing and implementation; WorkBench is free software for small and growing teams, funded by a flat percentage of the payments you process.",
  rows: [
    {
      label: "Pricing model",
      workbench: `Free core software with full access for ${seats} users, not a trial, funded by processing when a client pays through it (${RATES_SHORT}). Optional flat-priced add-ons per company from ${voicePrice} a month; unlimited users come with the ${PLANS.SHOP.name} add-on at ${proPrice}.`,
      competitor: "An enterprise platform with custom quotes, typically involving implementation and onboarding fees on top of subscription pricing. Contact ServiceTitan for a quote.",
    },
    {
      label: "Target company size",
      workbench: "Built for small and growing home-service teams — a few techs up through a full crew.",
      competitor: "Built primarily for larger, established home-service businesses with dedicated office staff.",
    },
    {
      label: "Setup & onboarding",
      workbench: "A short application and KYC form; a person reviews and onboards your company directly, typically the same or next business day.",
      competitor: "Typically involves a sales process and a structured implementation, reflecting the platform's depth and enterprise focus.",
    },
    {
      label: "Payments",
      workbench: "Card and ACH built in at one flat, published rate, about what you pay for online card payments anywhere — the difference is there's no subscription underneath it. The pricing page has the exact numbers.",
      competitor: "Offers integrated payment processing as part of its platform.",
    },
    {
      label: "AI assistant",
      workbench: `Atlas — talk to it hands-free or type; it schedules, quotes, invoices, and messages on request, always with a confirmation step. ${freeTokens} free tokens every month; Atlas Full is ${planPrice}/month for ${planTokens}.`,
      competitor: "Has invested in AI capabilities across its platform; check their current offering for scope.",
    },
    {
      label: "Mobile app",
      workbench: "Native iPhone app with offline schedule viewing on the job site.",
      competitor: "Has dedicated mobile apps as part of its platform.",
    },
  ],
};

export const VS_PAGES: Record<string, VsPage> = {
  "jobber": jobber,
  "housecall-pro": housecallPro,
  "servicetitan": servicetitan,
};

export const VS_LIST: VsPage[] = Object.values(VS_PAGES);
