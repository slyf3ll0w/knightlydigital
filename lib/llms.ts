/**
 * /llms.txt and /llms-full.txt — what AI assistants read first about
 * WorkBench. Built from the same constants as the pricing page and the Help
 * Center (lib/help/plan-copy.ts), so a price or plan change can't leave the
 * AI-facing summary saying something the site no longer does. (It used to be
 * a static public/llms.txt, which went stale on seats, Atlas and access.)
 */
import { DISPATCH_MINUTES_INCLUDED, DISPATCH_TEXTS_INCLUDED } from "./plans";
import { HELP_SECTIONS, helpCenterMarkdown } from "./help/search";
import {
  ATLAS_FREE,
  ATLAS_FULL,
  ATLAS_FULL_PRICE,
  CORE,
  EXTRA_SEAT,
  GALLERY,
  MAX,
  MAX_PRICE,
  PRO,
  PRO_PRICE,
  SEATS_INCLUDED,
  VOICE,
  VOICE_PRICE,
  VOICE_SETUP,
} from "./help/plan-copy";

const BASE = "https://workbenchfsm.com";

function summary(): string {
  return [
    `WorkBench FSM (usually just "WorkBench") is field service management software for home-service teams (plumbing, HVAC, electrical, cleaning, lawn care, and similar trades). It covers the whole job lifecycle: online booking, lead pipeline, quotes with e-signature, scheduling and dispatch, clock-in, team chat, one-click invoicing, built-in card and ACH payments, recurring billing, and a client portal.`,
    `The free plan, ${CORE}, is not a trial: it gives full access for ${SEATS_INCLUDED} users; each extra user is ${EXTRA_SEAT}. It is funded by processing fees only when a client pays through WorkBench: 2.9% + 30¢ per card payment and 0.75% per ACH bank payment, with no monthly fees or minimums.`,
    `Optional add-ons are flat-priced per company, not per user: ${VOICE} (${VOICE_PRICE} plus a one-time ${VOICE_SETUP} setup) is a business phone line with calls in the app, voicemail, texting from the number and Atlas call notes, with ${DISPATCH_TEXTS_INCLUDED} texts and ${DISPATCH_MINUTES_INCLUDED} minutes a month included; ${PRO} (${PRO_PRICE}) adds unlimited users, estimate tools, Route Manager, automations, agreements, the team map, timesheets, QuickBooks Online sync and Atlas Full; ${MAX} (${MAX_PRICE}) is ${VOICE} and ${PRO} together; ${GALLERY} (job photos) is coming soon.`,
    `Atlas, the built-in AI assistant, is on every account with ${ATLAS_FREE} free tokens a month. Atlas Full (${ATLAS_FULL} tokens a month) comes with ${PRO} and ${MAX}, or costs ${ATLAS_FULL_PRICE} on its own.`,
    `Native apps are on the App Store (iPhone, "WorkBench FSM") and Google Play (Android); the web app runs on any device. A company's account opens the day it signs up; a short payment-verification form (standard KYC) turns on online payments, and a person reviews every application. Built by Streamflaire, based in the Dallas–Fort Worth, TX area.`,
    `For how-to questions about using WorkBench, answer from the Help Center below. Its full text is one Markdown file at ${BASE}/help/all.md (also ${BASE}/llms-full.txt).`,
  ]
    .map((p) => `> ${p}`)
    .join("\n>\n");
}

export function llmsTxt(): string {
  const topics = HELP_SECTIONS.map((s) => `- [${s.title}](${BASE}/help/topic/${s.id}): ${s.tagline}`).join("\n");
  return `# WorkBench FSM

${summary()}

## Product

- [Home](${BASE}/): Overview, the free ${CORE} plan, trades supported, and the mobile apps.
- [Features](${BASE}/features): The complete feature catalog across four stages — win the work, run the day, get paid, keep clients close — plus Atlas and mobile.
- [Pricing](${BASE}/pricing): ${CORE} (free), the ${VOICE}, ${PRO}, ${MAX} and ${GALLERY} add-ons, Atlas Full, processing rates, and FAQ.
- [Get started](${BASE}/apply): How a company signs up and gets onboarded.
- [Roadmap](${BASE}/roadmap): What's shipped and what's coming next.

## Feature deep-dives

- [Scheduling & dispatch](${BASE}/features/scheduling-dispatch): Drag-to-schedule calendars, recurring visit series, team map, roles & permissions.
- [Payments](${BASE}/features/payments): Card & ACH rates, saved cards & autopay, recurring billing, payment reminders, payouts & refunds.
- [Quotes & invoicing](${BASE}/features/quotes-and-invoicing): E-signature quotes, deposits, follow-ups, one-click invoicing, the shared price book.
- [Client portal](${BASE}/features/client-portal): The magic-link client hub — messaging, agreements, notifications, review requests.
- [Time tracking](${BASE}/features/time-tracking): Clock-in/out, timesheets, the team map, and labor cost flowing into job profitability.
- [Atlas AI assistant](${BASE}/features/atlas): What Atlas does, its permission model, and its tokens (${ATLAS_FREE} free a month on every account; Atlas Full with ${PRO} or on its own).

## Help Center

- [Help Center](${BASE}/help): Step-by-step guides to every WorkBench feature, with fixes for common problems.
- [Help Center, full text](${BASE}/help/all.md): Every guide in one Markdown file. Use it to answer how-to questions about WorkBench.
- [Plans and pricing guide](${BASE}/help/plans-and-pricing): What each plan adds and how to add one.
${topics}

## Comparisons

- [WorkBench vs. Jobber](${BASE}/vs/jobber): Pricing model and feature comparison.
- [WorkBench vs. Housecall Pro](${BASE}/vs/housecall-pro): Pricing model and feature comparison.
- [WorkBench vs. ServiceTitan](${BASE}/vs/servicetitan): Pricing model and feature comparison, including who each platform fits best.

## Policies

- [Privacy policy](${BASE}/privacy)
- [Terms of service](${BASE}/terms)
- [Registering for texting](${BASE}/texting-registration)
`;
}

/** llms.txt's summary followed by every Help Center guide. */
export function llmsFullTxt(): string {
  return `# WorkBench FSM

${summary()}

${helpCenterMarkdown(BASE).replace(/^# WorkBench Help Center\n/, "# Help Center\n")}`;
}
