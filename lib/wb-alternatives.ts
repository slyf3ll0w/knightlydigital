import { WB_TRADE_PHOTOS } from "@/lib/wb-site";

/**
 * The /alternatives/<competitor> pages: for the person searching
 * "free Jobber alternative", not "WorkBench vs Jobber" (that is /vs). The
 * vs pages compare feature by feature; these answer why someone leaves,
 * what they keep, what they give up, and how the switch goes. Copy about
 * the competitor stays general and hedged (their pricing and features
 * change without notice); numbers about WorkBench come from lib/plans via
 * the page. NUMBER-FREE by rule (scripts/test-wb-site.ts).
 */

export type Alternative = {
  slug: string;
  name: string;
  /** lib/wb-savings.ts COMPETITORS id, for the worked pricing example (null = no public list price). */
  savingsId: "jobber" | "housecall-pro" | null;
  photo: { src: string; alt: string };
  /** [plain, accent] halves of the h1. */
  headline: [string, string];
  intro: string;
  description: string;
  /** Why people search for an alternative. General, checkable, hedged. */
  reasons: { title: string; body: string }[];
  /** Exact titles from lib/wb-features.ts that cover what they use today. */
  keeps: string[];
  /** What WorkBench does not have, in plain words. */
  gives: string[];
  faq: { q: string; a: string }[];
};

export const ALTERNATIVES: Alternative[] = [
  {
    slug: "jobber",
    name: "Jobber",
    savingsId: "jobber",
    photo: WB_TRADE_PHOTOS.lawn,
    headline: ["A free Jobber alternative", "for home-service companies."],
    intro:
      "WorkBench FSM does what most companies use Jobber for: booking, scheduling, quotes the client signs on their phone, invoicing, card and bank payments, and a client portal. The core is free for a small team, not a trial, and nothing is priced per user unless you add a seat.",
    description:
      "Looking for a free Jobber alternative? WorkBench FSM covers scheduling, quotes with e-signature, invoicing, card and ACH payments, and a client portal for home-service companies. The core plan is free for a small team, not a trial; add-ons are flat per company.",
    reasons: [
      {
        title: "The bill grows with the crew",
        body: "Jobber's plans are tiered, and seats are part of what moves you up a tier. A busy season that adds two techs can mean a bigger plan, not just two more logins. WorkBench prices a seat as a seat, or unlimited users on one flat add-on.",
      },
      {
        title: "Paying for a trial that ends",
        body: "Jobber's free period is a trial of a paid plan. WorkBench's core plan is the product, on from the day you sign up, with no card and no clock. It is funded by payment processing when a client pays through it.",
      },
      {
        title: "Features behind the top tier",
        body: "On Jobber, things like automated quote follow-ups, online booking and job costing tend to arrive on higher plans. In WorkBench those are in the free core; the paid add-ons are a phone line, unlimited users with the ops tools, and job photos.",
      },
    ],
    keeps: ["Online booking", "Scheduling & dispatch", "Quotes with e-signature", "One-click invoicing", "Card & ACH built in", "Client hub", "Recurring visit series", "Review requests", "Quote follow-ups"],
    gives: [
      "Jobber has been at this since 2011; its integrations list and its community are larger.",
      "There is no automated Jobber importer. Clients come in from a spreadsheet; the price book is rebuilt by hand or with Atlas.",
      "Route optimization and the ops tools (timesheets, team map, automations, QuickBooks) are on the paid Pro add-on, not the free core.",
    ],
    faq: [
      {
        q: "Is WorkBench a cheaper Jobber?",
        a: "It is structured differently. Jobber charges a subscription whether or not money moves through it. WorkBench's core charges nothing; it earns a flat processing fee when a client pays through it, and the optional add-ons are flat per company. The pricing page has the current numbers and a side-by-side estimate.",
      },
      {
        q: "Can I move my clients over from Jobber?",
        a: "Yes. Export your client list from Jobber as a spreadsheet and import it; the client, address, phone and email come across. Quotes and invoices from before the switch stay in Jobber as records; new ones start in WorkBench.",
      },
      {
        q: "Do my clients have to sign up for anything?",
        a: "No. The client portal is a link, with no password. Clients open their invoices, agreements and messages from it, and pay from the same link.",
      },
      {
        q: "What does WorkBench not do that Jobber does?",
        a: "The honest list is above: a smaller integration catalog, no automated importer, and the ops tools on a paid add-on. The vs page goes feature by feature.",
      },
    ],
  },
  {
    slug: "housecall-pro",
    name: "Housecall Pro",
    savingsId: "housecall-pro",
    photo: WB_TRADE_PHOTOS.plumbing,
    headline: ["A free Housecall Pro alternative", "that is not a trial."],
    intro:
      "WorkBench FSM covers what most companies run on Housecall Pro: online booking, scheduling and dispatch, estimates the client signs on their phone, invoicing, card and bank payments, and a client portal. The core is free for a small team, with no monthly bill underneath it.",
    description:
      "Looking for a free Housecall Pro alternative? WorkBench FSM covers booking, scheduling, estimates with e-signature, invoicing, card and ACH payments and a client portal for home-service companies. The core plan is free for a small team, not a trial.",
    reasons: [
      {
        title: "The per-user plan",
        body: "Housecall Pro's plans include a set number of users, and extra people cost extra each month. In WorkBench the core includes a small team, extra seats are flat, and one add-on makes users unlimited.",
      },
      {
        title: "The trial clock",
        body: "Housecall Pro's free period is a trial. WorkBench's core plan is the product: on from day one, no card, no clock. It is funded by payment processing when a client pays through it.",
      },
      {
        title: "Paying for the parts you do not use",
        body: "A plan is a bundle. WorkBench's add-ons are separate and flat: a business phone line, the ops tools with unlimited users, and job photos. Take one, two, or none.",
      },
    ],
    keeps: ["Online booking", "Scheduling & dispatch", "Quotes with e-signature", "One-click invoicing", "Card & ACH built in", "Client hub", "Automatic notifications", "Review requests", "Two-way messaging"],
    gives: [
      "Housecall Pro's consumer marketplace sends some companies inbound leads; WorkBench does not try to replicate it.",
      "There is no automated Housecall Pro importer. Clients come in from a spreadsheet; the price book is rebuilt by hand or with Atlas.",
      "Route optimization, timesheets, the team map, automations and QuickBooks sync are on the paid Pro add-on, not the free core.",
    ],
    faq: [
      {
        q: "Is WorkBench free the way Housecall Pro's trial is free?",
        a: "No. A trial ends and a plan starts. WorkBench's core plan does not end. The company pays a flat processing fee when a client pays through it, or the client pays a service fee instead, and the optional add-ons are flat per company.",
      },
      {
        q: "Can I bring my clients over?",
        a: "Yes. Export your customer list from Housecall Pro as a spreadsheet and import it. Past invoices stay in Housecall Pro as records; new work starts in WorkBench.",
      },
      {
        q: "Does WorkBench have online booking?",
        a: "Yes, in the free core. Clients pick a real open time on your booking page or an embedded form, the job lands on the calendar, and the confirmation and reminders go out on their own.",
      },
      {
        q: "What does WorkBench not do that Housecall Pro does?",
        a: "The marketplace, an automated importer, and the ops tools on the free plan. The vs page compares the two feature by feature.",
      },
    ],
  },
  {
    slug: "servicetitan",
    name: "ServiceTitan",
    savingsId: null,
    photo: WB_TRADE_PHOTOS.hvac,
    headline: ["A ServiceTitan alternative", "sized for a small shop."],
    intro:
      "ServiceTitan is built for large operations with office staff and an implementation budget. WorkBench FSM is built for the one-to-ten-person company that needs booking, scheduling, estimates, invoicing, payments and a client portal today, with no implementation fee and a core plan that is free.",
    description:
      "Looking for a ServiceTitan alternative for a small home-service company? WorkBench FSM covers booking, scheduling, estimates with e-signature, invoicing, card and ACH payments and a client portal, with no implementation fee. The core plan is free for a small team.",
    reasons: [
      {
        title: "The implementation",
        body: "ServiceTitan is sold with onboarding and implementation that take weeks and a budget. WorkBench is a sign-up form; most companies are quoting and scheduling the same day.",
      },
      {
        title: "The contract",
        body: "ServiceTitan pricing is quoted per company, typically on a contract. WorkBench's core has no contract and no monthly bill; the add-ons are month to month and flat.",
      },
      {
        title: "More platform than the shop needs",
        body: "Call center tools, marketing attribution and multi-location reporting are real strengths for a large operation. A small company pays for them without using them.",
      },
    ],
    keeps: ["Online booking", "Scheduling & dispatch", "Quotes with e-signature", "One-click invoicing", "Card & ACH built in", "Client hub", "Time tracking & timesheets", "Job profitability", "Lead pipeline"],
    gives: [
      "ServiceTitan is the deeper platform for multi-location operations, call centers and marketing attribution.",
      "There is no automated ServiceTitan importer; clients come in from a spreadsheet.",
      "Route optimization, timesheets, automations and QuickBooks sync are on the paid Pro add-on, not the free core.",
    ],
    faq: [
      {
        q: "Who should stay on ServiceTitan?",
        a: "A company with dedicated office staff, several locations, a call center, or reporting needs beyond day-to-day job management. ServiceTitan's depth is real; it is the size of the shop that decides.",
      },
      {
        q: "Does WorkBench have a phone system?",
        a: "The Voice add-on gives the company its own business line: calls ring the app and the cell, voicemail, texting from the number, and Atlas call notes. It is a flat add-on, not a call center.",
      },
      {
        q: "Can I bring my clients over?",
        a: "Yes, from a spreadsheet export. Past jobs and invoices stay in ServiceTitan as records; new work starts in WorkBench.",
      },
      {
        q: "What does WorkBench cost?",
        a: "The core plan is free for a small team, not a trial. The pricing page lists the flat add-ons and the processing rate, and has an estimate against the subscription platforms.",
      },
    ],
  },
];

export function alternativeBySlug(slug: string): Alternative | undefined {
  return ALTERNATIVES.find((a) => a.slug === slug);
}

export const ALTERNATIVES_PATH = "/alternatives";
