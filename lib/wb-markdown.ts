/**
 * Markdown twins of the marketing pages an AI agent is most often asked
 * about: /pricing.md, /vs/<competitor>.md, /alternatives.md and
 * /alternatives/<competitor>.md. An agent sent to the HTML page has to dig
 * the numbers out of a layout; these say the same thing as plain text.
 *
 * Every number comes from lib/plans.ts / lib/atlas-pricing.ts and every
 * comparison row from lib/wb-vs.ts / lib/wb-alternatives.ts — the same
 * sources the pages render — so a price change reaches both on one deploy.
 * No price is typed here (scripts/test-wb-site.ts scans this file).
 */
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "./atlas-pricing";
import {
  ANNUAL_MONTHS,
  DISPATCH_SETUP_CENTS,
  EXTRA_SEAT_CENTS,
  FAIR_USE_FORBIDDEN,
  FAIR_USE_SENTENCE,
  FREE_PLAN_NAME,
  FULL_SHOP,
  INCLUDED_SEATS,
  PLANS,
  RATES,
  annualCents,
  formatCents,
  separatelyMonthlyCents,
  type Plan,
} from "./plans";
import { SERVICE_FEE_CARD } from "./service-fee";
import { ALTERNATIVES, ALTERNATIVES_PATH, type Alternative } from "./wb-alternatives";
import { freeGroups } from "./wb-free";
import { WB_PHONE } from "./wb-site";
import { VS_LIST, type VsPage } from "./wb-vs";

const BASE = "https://workbenchfsm.com";

/** Every Markdown twin: the .md path and the page it mirrors. */
export const MARKDOWN_PAGES: { md: string; page: string; title: string }[] = [
  { md: "/pricing.md", page: "/pricing", title: "Pricing" },
  ...VS_LIST.map((v) => ({ md: `/vs/${v.slug}.md`, page: `/vs/${v.slug}`, title: `WorkBench vs. ${v.name}` })),
  { md: `${ALTERNATIVES_PATH}.md`, page: ALTERNATIVES_PATH, title: "Alternatives" },
  ...ALTERNATIVES.map((a) => ({
    md: `${ALTERNATIVES_PATH}/${a.slug}.md`,
    page: `${ALTERNATIVES_PATH}/${a.slug}`,
    title: `${a.name} alternative`,
  })),
];

/**
 * A text/markdown response. The canonical Link header points search engines
 * at the real page, so the twin is never indexed as a duplicate of it.
 */
export function markdownResponse(body: string, page: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
      link: `<${BASE}${page}>; rel="canonical"`,
    },
  });
}

const dispatch = PLANS.DISPATCH;
const shop = PLANS.SHOP;
const jobsite = PLANS.JOBSITE;
const seatPrice = formatCents(EXTRA_SEAT_CENTS);
const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const atlasPrice = formatPlanPrice();
const monthsFree = 12 - ANNUAL_MONTHS;

const monthly = (cents: number) => `${formatCents(cents)}/month`;
const yearly = (cents: number) => `${formatCents(annualCents(cents))}/year`;
const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
/** A table cell: one line, no stray column breaks. */
const cell = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");

function header(title: string, page: string): string {
  return `# ${title}

> Markdown version of ${BASE}${page}, for AI agents and anyone who wants plain text. It is generated from the same data as that page. Prices are in US dollars. More about WorkBench FSM: ${BASE}/llms.txt`;
}

function addOn(plan: Plan, note: string): string {
  return `### ${plan.name}: ${monthly(plan.monthlyCents)}${plan.comingSoon ? " (coming soon, not sold yet)" : ""}

${plan.tagline} Annual: ${yearly(plan.monthlyCents)}.

${bullets(plan.includes)}

${note}`;
}

export function pricingMarkdown(): string {
  const saveNow = separatelyMonthlyCents() - FULL_SHOP.monthlyCents;
  return `${header("WorkBench FSM pricing", "/pricing")}

## In short

- **${FREE_PLAN_NAME}, the free plan: ${formatCents(0)}/month.** Full access for ${INCLUDED_SEATS} users. Not a trial: no credit card, no time limit.
- **Extra users:** ${seatPrice} per user per month on ${FREE_PLAN_NAME}, ${dispatch.name} and ${jobsite.name}. ${shop.name} and ${FULL_SHOP.name} include unlimited users.
- **Optional add-ons**, each one flat price per company (not per user): ${dispatch.name} ${monthly(dispatch.monthlyCents)}, ${shop.name} ${monthly(shop.monthlyCents)}, ${FULL_SHOP.name} ${monthly(FULL_SHOP.monthlyCents)}, ${jobsite.name} ${monthly(jobsite.monthlyCents)} (coming soon).
- **Payment processing**, charged only when a client pays through WorkBench: ${RATES.companyPaid.card} per card transaction and ${RATES.companyPaid.ach} per ACH bank transfer when the company pays the fee; or the client pays a service fee instead (${RATES.serviceFee.card} card, ${RATES.serviceFee.ach} ACH) and the company receives the full invoice amount.
- No monthly fees or minimums on payments, and no charge on failed or declined payments. Recording cash and check payments is free.

## Plans at a glance

| Plan | Monthly | Annual | Users | What it is |
| --- | --- | --- | --- | --- |
| ${FREE_PLAN_NAME} | ${formatCents(0)} | ${formatCents(0)} | ${INCLUDED_SEATS} included, ${seatPrice}/month each after | The whole core product, free |
| ${dispatch.name} | ${formatCents(dispatch.monthlyCents)} | ${formatCents(annualCents(dispatch.monthlyCents))} | Same as ${FREE_PLAN_NAME} | ${cell(dispatch.tagline)} |
| ${shop.name} | ${formatCents(shop.monthlyCents)} | ${formatCents(annualCents(shop.monthlyCents))} | Unlimited | ${cell(shop.tagline)} |
| ${FULL_SHOP.name} | ${formatCents(FULL_SHOP.monthlyCents)} | ${formatCents(annualCents(FULL_SHOP.monthlyCents))} | Unlimited | ${dispatch.name} and ${shop.name} together |
| ${jobsite.name} (coming soon) | ${formatCents(jobsite.monthlyCents)} | ${formatCents(annualCents(jobsite.monthlyCents))} | Same as ${FREE_PLAN_NAME} | ${cell(jobsite.tagline)} |

Annual billing is ${ANNUAL_MONTHS} months' price for 12 months (${monthsFree} months free), on any add-on.

## What ${FREE_PLAN_NAME} includes (free)

${freeGroups.map((g) => `**${g.label}**\n\n${bullets(g.items)}`).join("\n\n")}

## Add-ons

${addOn(dispatch, `Plus ${formatCents(DISPATCH_SETUP_CENTS)} once, to buy the number and register it with the carriers so it can text. ${FAIR_USE_SENTENCE} ${FAIR_USE_FORBIDDEN}`)}

${addOn(shop, `Atlas Full on its own is ${atlasPrice} a month; ${shop.name} includes its ${planTokens} tokens.`)}

${addOn(jobsite, "In the works now. The price is what it will be when it ships.")}

### ${FULL_SHOP.name}: ${monthly(FULL_SHOP.monthlyCents)}

${FULL_SHOP.tagline} Annual: ${yearly(FULL_SHOP.monthlyCents)}.

- Everything in ${dispatch.name}
- Everything in ${shop.name}, unlimited users included
- ${jobsite.name} joins at no extra charge when it ships

${saveNow > 0 ? `${formatCents(saveNow)} a month less than ${dispatch.name} and ${shop.name} bought separately. ` : ""}The price becomes ${monthly(FULL_SHOP.monthlyCentsAfterJobsite)} once ${jobsite.name} ships; a company that starts before then keeps ${monthly(FULL_SHOP.monthlyCents)}. The ${formatCents(DISPATCH_SETUP_CENTS)} number setup still applies.

## Users

A user is anyone who signs in: the owner, the office, every tech. ${INCLUDED_SEATS} are included on ${FREE_PLAN_NAME}, ${dispatch.name} and ${jobsite.name}; each one after that is ${seatPrice} a month. ${shop.name} and ${FULL_SHOP.name} include unlimited users. Clients using the client portal are never users.

## Payment processing

Card and ACH bank payments are built into every quote, invoice and booking. The company chooses who pays the fee:

| Who pays the fee | Card | ACH bank transfer |
| --- | --- | --- |
| The company | ${RATES.companyPaid.card} | ${RATES.companyPaid.ach} |
| The client, as a service fee at checkout | ${RATES.serviceFee.card} | ${RATES.serviceFee.ach} |

With the service fee, the company receives the full invoice amount. Either way there are no monthly fees, no volume minimums and no charge on failed payments. Payments run through the company's own Square account, connected from Settings in a few minutes.

## Atlas, the AI assistant

Atlas is metered in tokens. A quick question costs a couple hundred tokens; a bulk edit across forty records costs a couple thousand. Atlas never spends past the allowance.

| | Price | Tokens a month |
| --- | --- | --- |
| Atlas Free | ${formatCents(0)}, on every account | ${freeTokens} |
| Atlas Full | ${atlasPrice}/month on its own; included with ${shop.name} and ${FULL_SHOP.name} | ${planTokens} |

Free tokens refill on the 1st of every month and are shared by the whole team.

## Billing terms

- Add-ons are billed monthly or annually and renew automatically until cancelled. Cancelling ends the plan at the end of the term already paid for.
- A company can start monthly and switch to annual later; the yearly term starts the day of the switch. Nothing is prorated or credited back.
- Plan charges are card payments and carry the card service fee (${SERVICE_FEE_CARD}); the exact total is shown before confirming.
- If pricing or packaging ever changes, existing customers are grandfathered in: the features they already use stay, at the price they signed up for.

## Getting started

The account opens the day a company signs up at ${BASE}/apply, with no card. Add-ons are switched on afterwards from Settings → Plans. To talk to a person first, book a setup call at ${BASE}/book-a-call or call ${WB_PHONE.display}.

## Related

- [Pricing page](${BASE}/pricing): the same numbers, a savings estimate against subscription platforms, and the full FAQ.
${VS_LIST.map((v) => `- [WorkBench vs. ${v.name}](${BASE}/vs/${v.slug}.md)`).join("\n")}
- [Alternatives](${BASE}${ALTERNATIVES_PATH}.md)
- [Help Center, full text](${BASE}/help/all.md)
`;
}

export function vsMarkdown(v: VsPage): string {
  return `${header(`WorkBench vs. ${v.name}`, `/vs/${v.slug}`)}

${v.intro}

## Side by side

| | WorkBench | ${v.name} |
| --- | --- | --- |
${v.rows.map((r) => `| **${cell(r.label)}** | ${cell(r.workbench)} | ${cell(r.competitor)} |`).join("\n")}

What this says about ${v.name} is general and may be out of date; check their site for current plans and prices. WorkBench's own numbers are current as of this page.

## Related

- [WorkBench pricing](${BASE}/pricing.md): every plan, price and processing rate.
- [${v.name} alternative](${BASE}${ALTERNATIVES_PATH}/${v.slug}.md): why companies switch, what they keep and what they give up.
- [The full comparison page](${BASE}/vs/${v.slug}): the same table plus an FAQ.
`;
}

export function alternativeMarkdown(a: Alternative): string {
  return `${header(`${a.name} alternative: WorkBench FSM`, `${ALTERNATIVES_PATH}/${a.slug}`)}

${a.intro}

## Why companies look for a ${a.name} alternative

${a.reasons.map((r) => `- **${r.title}.** ${r.body}`).join("\n")}

## What you keep in WorkBench

${bullets(a.keeps)}

## What you give up

${bullets(a.gives)}

## Questions

${a.faq.map((f) => `**${f.q}**\n\n${f.a}`).join("\n\n")}

## Related

- [WorkBench pricing](${BASE}/pricing.md): every plan, price and processing rate.
- [WorkBench vs. ${a.name}](${BASE}/vs/${a.slug}.md): the feature-by-feature table.
- [The full page](${BASE}${ALTERNATIVES_PATH}/${a.slug})
`;
}

export function alternativesMarkdown(): string {
  return `${header("WorkBench FSM as an alternative", ALTERNATIVES_PATH)}

WorkBench FSM is field service management software for home-service companies. The core plan, ${FREE_PLAN_NAME}, is free for ${INCLUDED_SEATS} users and is not a trial; optional add-ons are flat per company. These pages cover why companies switch from each platform, what they keep, and what they give up.

${ALTERNATIVES.map((a) => `- [${a.name} alternative](${BASE}${ALTERNATIVES_PATH}/${a.slug}.md): ${a.description}`).join("\n")}

## Related

- [WorkBench pricing](${BASE}/pricing.md)
${VS_LIST.map((v) => `- [WorkBench vs. ${v.name}](${BASE}/vs/${v.slug}.md)`).join("\n")}
`;
}
