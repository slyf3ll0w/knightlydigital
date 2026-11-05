import type { LucideIcon } from "lucide-react";
import { AppWindow, Bug, Droplets, Fan, Hammer, Home, Leaf, Lightbulb, PaintRoller, Plug, Shovel, Snowflake, Sparkles, SprayCan, Truck, Warehouse, Waves, Zap } from "lucide-react";
import { WB_DAY_PHOTOS, WB_PHOTOS, WB_SHOTS, WB_TRADE_PHOTOS } from "@/lib/wb-site";

/**
 * The per-trade landing pages (/trades/<slug>) and the trade cards on Home
 * and /trades, from one list. The copy here is deliberately number-free:
 * prices, seats, rates and token allowances come from lib/plans.ts and
 * lib/atlas-pricing.ts through the page template, and
 * scripts/test-wb-site.ts fails the build if a trade's text ever carries a
 * literal price. Every feature named in `features` must exist in the
 * catalog (lib/wb-features.ts), so a renamed or removed feature can't
 * leave a trade page advertising it.
 */

export type ShotKey = keyof typeof WB_SHOTS;

export type Trade = {
  slug: string;
  /** "Plumbing", "HVAC", "Pool service" — the card label and the h1 subject. */
  name: string;
  /** "a plumbing company" — used in the generated free-plan FAQ. */
  noun: string;
  eyebrow: string;
  icon: LucideIcon;
  photo: { src: string; alt: string };
  shot: ShotKey;
  chip: { title: string; sub: string };
  /** [plain part, accent part] of the h1. */
  headline: [string, string];
  intro: string;
  /** The <meta name="description">. */
  description: string;
  steps: { title: string; body: string }[];
  /** Exact titles from lib/wb-features.ts. */
  features: string[];
  faq: { q: string; a: string }[];
};

export const TRADES: Trade[] = [
  {
    slug: "plumbing",
    name: "Plumbing",
    noun: "a plumbing company",
    eyebrow: "For plumbing companies",
    icon: Droplets,
    photo: WB_TRADE_PHOTOS.plumbing,
    shot: "quotes",
    chip: { title: "Quote approved", sub: "Water heater replacement · signed" },
    headline: ["Plumbing software that runs the job", "from the first call to the paid invoice."],
    intro:
      "Emergency calls, quotes with options the homeowner picks from on their phone, a deposit before the truck rolls, and the invoice paid in the driveway. WorkBench FSM is field service management software built for plumbers, and the core of it is free.",
    description:
      "Free plumbing business software: online booking, scheduling and dispatch, quotes with e-signature and deposits, one-click invoicing with card and ACH payments, a client portal, and Atlas, an AI assistant you can talk to hands-free. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "The call comes in",
        body: "Book it from the phone, or let the homeowner pick a time on your website. The job lands on the schedule with the address, the notes, and who is taking it.",
      },
      {
        title: "Quote on the spot",
        body: "Build the quote from your price book, add options the client can toggle (the standard heater or the tankless), and they sign on their phone. Ask for a deposit before you order parts.",
      },
      {
        title: "Paid before you leave",
        body: "Finish the job, send the invoice from the driveway, and the client pays by card or bank transfer from the link. If they pay later, reminders go out on their own.",
      },
    ],
    features: ["Quotes with e-signature", "Deposits up front", "Online booking", "Scheduling & dispatch", "One-click invoicing", "Review requests"],
    faq: [
      {
        q: "Can I quote good-better-best options?",
        a: "Yes. A quote can carry optional add-ons the client toggles on or off before they sign, so one quote covers the repair and the replacement. The total updates as they choose, and the accepted version converts to the job in one click.",
      },
      {
        q: "How do I handle an emergency call that jumps the schedule?",
        a: "Drag the job onto the calendar wherever it fits, or tell Atlas to move the rest of the day. Clients whose times change hear about it automatically, and the day view shows every stop in order so you can see what a same-day call does to the afternoon.",
      },
      {
        q: "Can I collect a deposit before ordering a water heater?",
        a: "Yes. Turn on a deposit when you send the quote. The client pays it by card or bank transfer when they sign, and the balance goes on the final invoice.",
      },
      {
        q: "Do annual flushes and maintenance visits repeat on their own?",
        a: "Yes. Set up a visit series for the client and WorkBench creates each visit on the schedule ahead of time. Bill each visit as it is done, or roll the client onto a monthly plan.",
      },
    ],
  },
  {
    slug: "hvac",
    name: "HVAC",
    noun: "an HVAC company",
    eyebrow: "For HVAC companies",
    icon: Fan,
    photo: WB_TRADE_PHOTOS.hvac,
    shot: "schedule",
    chip: { title: "Spring tune-ups", sub: "Visit series · placed weeks ahead" },
    headline: ["HVAC software for maintenance plans,", "replacements, and the busy season."],
    intro:
      "Maintenance agreements that bill themselves, seasonal tune-ups that land on the schedule weeks ahead, replacement quotes with options the homeowner picks from, and the invoice paid before the truck leaves. The core of WorkBench FSM is free.",
    description:
      "Free HVAC business software: maintenance plans with recurring billing and autopay, visit series for seasonal tune-ups, scheduling and dispatch, replacement quotes with e-signature and deposits, invoicing with card and ACH payments, and a client portal. The core plan is free, not a trial.",
    steps: [
      {
        title: "Maintenance plans that run themselves",
        body: "Sell a plan once. The client's saved card charges on schedule, and the spring and fall visits appear on the calendar ahead of time for a dispatcher to place.",
      },
      {
        title: "Replacements quoted with options",
        body: "Build the quote with the system tiers as toggles the homeowner picks from on their phone, get the signature there, and take the deposit before the equipment is ordered.",
      },
      {
        title: "Peak season, under control",
        body: "Day and week views with every stop in order, techs clocking in on the job, and photos and notes from the attic that the office sees as they happen.",
      },
    ],
    features: ["Recurring visit series", "Recurring billing, three ways", "Saved cards & autopay", "Quotes with e-signature", "Deposits up front", "Agreements & contracts"],
    faq: [
      {
        q: "How do maintenance agreements work?",
        a: "A client can be on a flat monthly plan that charges their saved card on its own, with a visit series that puts the tune-ups on the schedule. Written service agreements with e-signature, stored on the client and visible in their portal, come with the Pro add-on.",
      },
      {
        q: "Can a quote show a few system options?",
        a: "Yes. Optional line items are toggles the client switches on or off before signing, so one quote covers the standard, high-efficiency, and heat-pump choices. The accepted version becomes the job.",
      },
      {
        q: "What happens when a tune-up has to move?",
        a: "Drag it to another day. Only that visit moves; the rest of the series stays put, and the client gets the new time automatically.",
      },
      {
        q: "Do techs need a laptop?",
        a: "No. The iPhone and Android apps carry the schedule, job notes and photos, clock-in, team chat, and invoicing, and the schedule works offline.",
      },
    ],
  },
  {
    slug: "electrical",
    name: "Electrical",
    noun: "an electrical contractor",
    eyebrow: "For electrical contractors",
    icon: Zap,
    photo: WB_TRADE_PHOTOS.electrical,
    shot: "jobs",
    chip: { title: "Panel upgrade · photos added", sub: "Ravenwood Dr · in progress" },
    headline: ["Electrical contractor software", "from the estimate to the paid invoice."],
    intro:
      "Panel upgrades quoted with a deposit, service calls booked online, photos of the work on every job, and the labor behind each job on its margin. WorkBench FSM is free field service management software for electricians.",
    description:
      "Free electrical contractor software: quotes with e-signature and deposits, online booking, scheduling and dispatch, job notes and photos, clock-in with labor costing, invoicing with card and ACH payments, and a client portal. The core plan is free, not a trial.",
    steps: [
      {
        title: "Quote it, sign it, fund it",
        body: "Build the estimate from your price book, let the client sign on their phone, and collect a deposit before you pull the permit or order the panel.",
      },
      {
        title: "The job carries its history",
        body: "Status, notes, and before-and-after photos from the field live on the job, so the office and the inspector's question six weeks later both get answered.",
      },
      {
        title: "Know what the job made",
        body: "Techs clock in on the job on every plan. With the Pro add-on, those hours flow into each job's margin as real labor cost, next to materials, so you know which work is worth chasing.",
      },
    ],
    features: ["Quotes with e-signature", "Deposits up front", "Jobs with notes & photos", "Scheduling & dispatch", "Job profitability", "Time tracking & timesheets"],
    faq: [
      {
        q: "Can I take a deposit on a panel upgrade?",
        a: "Yes. Turn on a deposit when you send the quote. The client pays it by card or bank transfer when they sign, and the balance goes on the final invoice.",
      },
      {
        q: "Where do photos of the work go?",
        a: "On the job, straight from the phone app, next to the notes. Your crew and office see them on the job; the client sees their visits and invoices in their portal.",
      },
      {
        q: "Does hourly work fit, or only flat-rate?",
        a: "Both. Keep flat rates in the price book for the common jobs, and bill time and materials from the time clock for the rest. Either way the invoice is one click.",
      },
      {
        q: "Can I see whether a job made money?",
        a: "Each job shows its margin: revenue against materials and labor. Clocking in is on every plan; weekly timesheets and labor cost flowing into the margin come with the Pro add-on.",
      },
    ],
  },
  {
    slug: "lawn-care",
    name: "Lawn care",
    noun: "a lawn care company",
    eyebrow: "For lawn care and landscaping",
    icon: Leaf,
    photo: WB_TRADE_PHOTOS.lawn,
    shot: "schedule",
    chip: { title: "Weekly mow · Thursdays", sub: "Billed monthly · autopay" },
    headline: ["Lawn care software for weekly routes", "and monthly invoices that send themselves."],
    intro:
      "Weekly mows that repeat on the schedule, one tidy invoice a month with a line per visit, cards that charge on their own, and reminders for the few who still pay late. The core of WorkBench FSM is free.",
    description:
      "Free lawn care business software: recurring visit series, per-visit billing rolled into one monthly invoice, saved cards and autopay, online booking, automatic visit reminders, and payment reminders. The core plan is free, not a trial.",
    steps: [
      {
        title: "Set the route once",
        body: "A visit series puts every weekly or biweekly visit on the schedule weeks ahead. Rain day? Drag that one visit; the rest of the series stays where it was.",
      },
      {
        title: "Bill the way the client wants",
        body: "A flat monthly plan, a bill after each visit, or every visit of the month on one invoice with a dated line per visit. Pick per client.",
      },
      {
        title: "Get paid without asking",
        body: "Saved cards charge on their own. A declined card retries on a schedule and nudges the client to update it before you ever have to call.",
      },
    ],
    features: ["Recurring visit series", "Recurring billing, three ways", "Saved cards & autopay", "Online booking", "Automatic notifications", "Payment reminders"],
    faq: [
      {
        q: "Can I invoice once a month for weekly visits?",
        a: "Yes. Completed visits wait in a pool and go out as one invoice a month with a dated line per visit, charged to the saved card or sent as a pay link.",
      },
      {
        q: "What if it rains?",
        a: "Drag that visit to another day. Only that one moves, the rest of the series stays put, and the client is told the new time automatically.",
      },
      {
        q: "Can clients book cleanups or one-off work online?",
        a: "Yes. The booking page shows your real availability for one-time jobs, and existing clients can request more work from their portal.",
      },
      {
        q: "Does it plan the route?",
        a: "Route Manager, which orders a day's stops and adds drive time, is in beta and comes with the Pro add-on. On every plan the day and week views show each person's stops in order.",
      },
    ],
  },
  {
    slug: "roofing",
    name: "Roofing",
    noun: "a roofing company",
    eyebrow: "For roofing companies",
    icon: Home,
    photo: WB_TRADE_PHOTOS.roofing,
    shot: "quotes",
    chip: { title: "Lead from Meta ads", sub: "Quote viewed · just now" },
    headline: ["Roofing software that turns leads", "into signed, funded jobs."],
    intro:
      "Leads from your ads land on a board, the estimate goes out with e-signature and a deposit, you see when the homeowner opens it, and progress payments are first-class. WorkBench FSM is free field service management software for roofers.",
    description:
      "Free roofing company software: lead pipeline with a webhook for Meta and Google lead forms, quotes with e-signature and deposits, open tracking, partial and progress payments, job photos, and a client portal. The core plan is free, not a trial.",
    steps: [
      {
        title: "Every lead on one board",
        body: "Website forms, Meta and Google lead ads, and calls land on a pipeline board with your own stages. Cards move themselves when a quote goes out or an appointment is set.",
      },
      {
        title: "Estimates that close",
        body: "Line items from your price book, options the homeowner can toggle, e-signature on their phone, and a deposit at approval. You see when they open it, so the follow-up lands at the right moment.",
      },
      {
        title: "Paid in stages",
        body: "Deposits and partial payments are first-class: collect at signing, at dry-in, and at completion, by card or bank transfer, with the records clean for the bookkeeper.",
      },
    ],
    features: ["Lead pipeline", "Lead webhook", "Quotes with e-signature", "Deposits up front", "Know when they've looked", "Jobs with notes & photos"],
    faq: [
      {
        q: "Can leads from Facebook and Google ads go straight in?",
        a: "Yes. A lead webhook takes leads from Zapier, Make, Meta lead ads, and Google lead forms and drops them on the board the moment they exist.",
      },
      {
        q: "How do progress payments work?",
        a: "Take a deposit at quote approval, then partial payments on the invoice as the job moves. Each payment is recorded against the invoice, and the balance stays visible to you and the client.",
      },
      {
        q: "Can I work with subcontractor crews?",
        a: "A job can be marked as outsourced to a sub, so it stays on the calendar without needing one of your own crew assigned to it.",
      },
      {
        q: "Do photos of the roof go on the job?",
        a: "Yes. Before-and-after photos from the phone live on the job with the notes. A dedicated photo gallery with stamps and client share links, the Gallery add-on, is coming.",
      },
    ],
  },
  {
    slug: "cleaning",
    name: "Cleaning",
    noun: "a cleaning company",
    eyebrow: "For cleaning companies",
    icon: Sparkles,
    photo: WB_TRADE_PHOTOS.cleaning,
    shot: "clients",
    chip: { title: "Biweekly clean · booked", sub: "Card on file · charges after the visit" },
    headline: ["Cleaning business software for recurring", "clients who pay without being asked."],
    intro:
      "Recurring cleans that repeat on the schedule, clients who book online, cards that charge after each visit, and reminders the day before so nobody is surprised at the door. The core of WorkBench FSM is free.",
    description:
      "Free cleaning business software: online booking, recurring visit series, bill-after-each-visit with saved cards and autopay, automatic visit reminders, team chat, and a client portal. The core plan is free, not a trial.",
    steps: [
      {
        title: "Book once, repeat forever",
        body: "A weekly or biweekly series puts every clean on the schedule ahead of time. Skip one, move one, or add a deep clean without touching the rest.",
      },
      {
        title: "Charge after the visit",
        body: "Bill after each visit and the client's saved card is charged when the job is marked done. Or roll the month into one invoice; it's per client.",
      },
      {
        title: "The team knows the house",
        body: "Notes and photos live on the job, the crew chats in one place with push notifications, and the client messages you from their portal instead of texting whoever's number they have.",
      },
    ],
    features: ["Online booking", "Recurring visit series", "Recurring billing, three ways", "Saved cards & autopay", "Automatic notifications", "Team chat"],
    faq: [
      {
        q: "Can clients book a first clean online?",
        a: "Yes. The booking widget on your website shows real availability. Jobs that need a look first can go through an approval loop instead of landing straight on the calendar.",
      },
      {
        q: "How does billing after each visit work?",
        a: "When a visit is marked done, its invoice is created and either charged to the saved card or sent as a pay link, whichever the client is set up for.",
      },
      {
        q: "Will clients get a reminder before we arrive?",
        a: "Yes. Visit reminders go out the day before and about an hour out, sent from your business name, without anyone having to remember.",
      },
      {
        q: "Can I keep notes like the alarm code or the dog's name?",
        a: "Notes live on the client and on each job, so whoever takes the visit has them in the app. Custom client fields hold anything you want on every client.",
      },
    ],
  },
  {
    slug: "pressure-washing",
    name: "Pressure washing",
    noun: "a pressure washing business",
    eyebrow: "For pressure washing",
    icon: SprayCan,
    photo: WB_TRADE_PHOTOS.pressure,
    shot: "invoices",
    chip: { title: "Driveway + patio · paid", sub: "Review request sent" },
    headline: ["Pressure washing software for one-visit jobs", "that get booked, done, and paid fast."],
    intro:
      "Quotes the client approves from their phone, booking that fills the calendar while you work, an invoice sent from the driveway, and a review request when the money lands. The core of WorkBench FSM is free.",
    description:
      "Free pressure washing business software: online booking, quotes with e-signature, scheduling, one-click invoicing with card and ACH payments, automatic payment reminders, and review requests after payment. The core plan is free, not a trial.",
    steps: [
      {
        title: "Booked while you're on a job",
        body: "Your website's booking page shows real open times. A new booking lands on the calendar and the client gets the confirmation, no phone call needed.",
      },
      {
        title: "Done and invoiced from the truck",
        body: "Mark the job done, send the invoice from the phone, and the client pays from the link. Cash and checks are recorded too.",
      },
      {
        title: "Ask for the review while they're happy",
        body: "When the payment lands, WorkBench asks the client for a review and points them at your Google listing.",
      },
    ],
    features: ["Online booking", "Quotes with e-signature", "Scheduling & dispatch", "One-click invoicing", "Card & ACH built in", "Review requests"],
    faq: [
      {
        q: "Can I price by the job and quote fast?",
        a: "Keep your services and rates in the price book, build the quote from it in a minute, and the client signs on their phone. Accepted quotes become jobs in one click.",
      },
      {
        q: "What if the weather moves a job?",
        a: "Drag it to another day. The client gets the new time automatically, and the schedule stays in order.",
      },
      {
        q: "Do I need to take card payments?",
        a: "No. Cash and check payments can be recorded on any invoice. Online payments are there when you want them, and the pricing page has the processing rates.",
      },
      {
        q: "Does it ask for reviews?",
        a: "Yes. After a payment lands, WorkBench asks the client for a review and links to your Google listing while the goodwill is fresh.",
      },
    ],
  },
  {
    slug: "pool-service",
    name: "Pool service",
    noun: "a pool service company",
    eyebrow: "For pool service companies",
    icon: Waves,
    photo: WB_TRADE_PHOTOS.pool,
    shot: "schedule",
    chip: { title: "Weekly service · route day", sub: "One invoice a month each" },
    headline: ["Pool service software for weekly routes,", "chemical notes, and monthly billing."],
    intro:
      "Weekly service that repeats on the schedule, readings and photos on every visit, repairs quoted alongside the route, and one invoice a month that the saved card pays. The core of WorkBench FSM is free.",
    description:
      "Free pool service software: recurring visit series, per-visit notes and photos, monthly consolidated billing with autopay, repair quotes with e-signature, automatic reminders, and a client portal. The core plan is free, not a trial.",
    steps: [
      {
        title: "Every pool, every week",
        body: "A visit series puts each weekly stop on the schedule weeks ahead. Move one, skip one, or add a filter clean without touching the rest.",
      },
      {
        title: "Readings and photos on the visit",
        body: "Chemical readings, what was added, and a photo of the water go in the visit's notes from the phone, so the next tech and the client's question both have an answer.",
      },
      {
        title: "One invoice a month",
        body: "Every visit of the month on one invoice with a dated line per visit, charged to the saved card. Repairs are quoted and invoiced on their own.",
      },
    ],
    features: ["Recurring visit series", "Recurring billing, three ways", "Saved cards & autopay", "Jobs with notes & photos", "Quotes with e-signature", "Payment reminders"],
    faq: [
      {
        q: "Can I bill weekly service once a month?",
        a: "Yes. Completed visits pool up and go out as one invoice a month with a dated line per visit, charged to the saved card or sent as a pay link.",
      },
      {
        q: "How do repairs fit alongside the route?",
        a: "Quote the repair from the price book, let the client sign on their phone, and it becomes its own job and invoice, separate from the monthly service.",
      },
      {
        q: "Where do chemical readings go?",
        a: "In the visit's notes, with a photo if you want one. Every visit keeps its own notes, so the history of a pool is on the client.",
      },
      {
        q: "Can clients see their visit history?",
        a: "Yes. The client portal shows upcoming visits, past invoices, and payments, and they can message you or request more work from it.",
      },
    ],
  },
  {
    slug: "handyman",
    name: "Handyman",
    noun: "a handyman business",
    eyebrow: "For handyman businesses",
    icon: Hammer,
    photo: WB_PHOTOS.trades,
    shot: "invoices",
    chip: { title: "Request payment", sub: "Link texted · paid from the driveway" },
    headline: ["Handyman software that's free", "for a one-person business."],
    intro:
      "Small jobs booked online, a quote in a minute, an invoice or a quick payment request sent from the driveway, and a client list that remembers everything. WorkBench FSM is free field service management software, and a solo operator is exactly who the free plan is for.",
    description:
      "Free handyman business software: online booking, quotes with e-signature, scheduling, job notes and photos, one-click invoicing and quick payment requests with card and ACH payments, and a client portal. Free for a one-person business, not a trial.",
    steps: [
      {
        title: "Booked without the phone tag",
        body: "Your booking page shows real open times. A new request lands on the calendar with the client's details and the confirmation already sent.",
      },
      {
        title: "Quote, or just get paid",
        body: "Build a quote when the job needs one. For the small stuff, Request payment makes a pay link you send from the driveway.",
      },
      {
        title: "Every client, remembered",
        body: "Jobs, notes, photos, quotes, and invoices live on the client, and they can see their history and pay from their own portal.",
      },
    ],
    features: ["Online booking", "Quotes with e-signature", "Scheduling & dispatch", "Jobs with notes & photos", "One-click invoicing", "Card & ACH built in"],
    faq: [
      {
        q: "I'm a one-person business. Is it built for that?",
        a: "Yes. A solo operator never hits the free plan's user limit, new jobs are assigned to you automatically, and the phone app carries the whole day.",
      },
      {
        q: "Can I charge for a small job without making a quote?",
        a: "Yes. Request payment makes a pay link for an amount and a description, which you send by text or email. The record lands on the client like any invoice.",
      },
      {
        q: "Can I bill by the hour?",
        a: "Yes. Clock in on the job and invoice the time, or keep flat rates in the price book for the jobs you do every week.",
      },
      {
        q: "Can I text clients from it?",
        a: "Confirmations and reminders go out automatically by email. With the Voice add-on you get your own business number, and texts to clients send from it with replies in one inbox.",
      },
    ],
  },
  {
    slug: "pest-control",
    name: "Pest control",
    noun: "a pest control company",
    eyebrow: "For pest control",
    icon: Bug,
    photo: WB_DAY_PHOTOS.arrive,
    shot: "clients",
    chip: { title: "Quarterly service · due", sub: "Reminder sent yesterday" },
    headline: ["Pest control software for quarterly service,", "agreements, and autopay."],
    intro:
      "Quarterly and monthly service that repeats on the schedule, treatment notes on every visit, service agreements with e-signature, and cards that charge on their own. The core of WorkBench FSM is free.",
    description:
      "Free pest control software: recurring visit series, treatment notes and photos, service agreements with e-signature, saved cards and autopay, automatic visit reminders, and a client portal. The core plan is free, not a trial.",
    steps: [
      {
        title: "Service that repeats",
        body: "A monthly or quarterly visit series puts every treatment on the schedule ahead of time. Reminders go to the client the day before, from your business name.",
      },
      {
        title: "What was treated, on the record",
        body: "Products, areas, and findings go in the visit's notes with photos from the phone, so the next tech and the client's question both have an answer.",
      },
      {
        title: "Paid on schedule",
        body: "A flat monthly plan that charges the saved card, a bill after each visit, or one invoice a month. A declined card retries and nudges the client to update it.",
      },
    ],
    features: ["Recurring visit series", "Recurring billing, three ways", "Saved cards & autopay", "Automatic notifications", "Jobs with notes & photos", "Agreements & contracts"],
    faq: [
      {
        q: "Can I put clients on an annual service agreement?",
        a: "Service agreements with e-signature, stored on the client and visible in their portal, come with the Pro add-on. Recurring visits and recurring billing are on every plan.",
      },
      {
        q: "How is quarterly service billed?",
        a: "Pick per client: a flat monthly plan, a bill after each visit, or every visit of the period on one invoice. Saved cards charge on their own.",
      },
      {
        q: "Will clients get a reminder before the visit?",
        a: "Yes. Reminders go out the day before and about an hour out, automatically, so nobody is surprised at the door.",
      },
      {
        q: "Where do treatment notes go?",
        a: "On each visit, with photos if you want them. Every visit keeps its own notes, so a property's treatment history is on the client.",
      },
    ],
  },
  {
    slug: "appliance-repair",
    name: "Appliance repair",
    noun: "an appliance repair business",
    eyebrow: "For appliance repair",
    icon: Plug,
    photo: WB_DAY_PHOTOS.paid,
    shot: "jobs",
    chip: { title: "Return visit · part arrived", sub: "Rescheduled · client notified" },
    headline: ["Appliance repair software for diagnostics,", "parts, and the return visit."],
    intro:
      "Service calls booked online, the diagnostic and the repair quote on the client's phone, model and serial numbers on the job, and the return visit scheduled when the part lands. The core of WorkBench FSM is free.",
    description:
      "Free appliance repair software: online booking, scheduling and dispatch, quotes with e-signature and deposits, job notes and photos for model and serial numbers, invoicing with card and ACH payments, and a client portal with job history. The core plan is free, not a trial.",
    steps: [
      {
        title: "Booked and dispatched",
        body: "The client books the service call on your website or you take it on the phone. It lands on the schedule with the appliance details in the notes.",
      },
      {
        title: "Diagnose, quote, fund the part",
        body: "Quote the repair from the price book with the part as a line item, the client signs on their phone, and a deposit covers the part before you order it.",
      },
      {
        title: "Back when the part arrives",
        body: "Drag the return visit onto the calendar and the client gets the new time automatically. Model, serial, and photos stay on the job.",
      },
    ],
    features: ["Online booking", "Scheduling & dispatch", "Quotes with e-signature", "Deposits up front", "Jobs with notes & photos", "One-click invoicing"],
    faq: [
      {
        q: "How do I charge a diagnostic fee?",
        a: "Invoice the diagnostic on the first visit, or fold it into the repair quote. Either way the invoice is one click and the client pays from a link.",
      },
      {
        q: "Where do model and serial numbers go?",
        a: "In the job's notes, with a photo of the label, or in custom client fields so every appliance at the house is on the client.",
      },
      {
        q: "How do return visits work?",
        a: "Schedule the second visit when the part is ordered, then drag it if the delivery slips. The client is told the new time automatically.",
      },
      {
        q: "Can clients see their repair history?",
        a: "Yes. The client portal shows past visits, invoices, and payments, and they can request more work from it.",
      },
    ],
  },
  {
    slug: "garage-doors",
    name: "Garage doors",
    noun: "a garage door company",
    eyebrow: "For garage door companies",
    icon: Warehouse,
    photo: WB_DAY_PHOTOS.morning,
    shot: "quotes",
    chip: { title: "Opener options · quote sent", sub: "Client chose the belt drive" },
    headline: ["Garage door software for same-day calls", "and quotes with options."],
    intro:
      "Same-day service booked online, a quote with opener options the homeowner picks from on their phone, photos of the install on the job, and the invoice paid before you drive off. The core of WorkBench FSM is free.",
    description:
      "Free garage door company software: online booking, scheduling and dispatch, quotes with e-signature and optional add-ons, job photos, invoicing with card and ACH payments, and review requests. The core plan is free, not a trial.",
    steps: [
      {
        title: "Same-day, without the phone tag",
        body: "The booking page shows real open times, so a stuck door gets a slot today without a call. The job lands on the schedule with the details.",
      },
      {
        title: "Options they pick themselves",
        body: "Quote the repair with the opener models as toggles the homeowner switches on or off, and they sign on their phone. The accepted version becomes the job.",
      },
      {
        title: "Paid and reviewed",
        body: "Send the invoice from the driveway and the client pays from the link. When the payment lands, WorkBench asks them for a review.",
      },
    ],
    features: ["Online booking", "Scheduling & dispatch", "Quotes with e-signature", "Jobs with notes & photos", "Card & ACH built in", "Review requests"],
    faq: [
      {
        q: "Can a quote offer a few opener models?",
        a: "Yes. Optional line items are toggles the client switches on or off before signing, so one quote covers the chain drive, the belt drive, and the smart opener.",
      },
      {
        q: "Can clients book same-day service online?",
        a: "Yes. The booking page shows your real availability, including today's open slots, and the booking lands on the calendar with the confirmation sent.",
      },
      {
        q: "Do photos of the install go on the job?",
        a: "Yes. Before-and-after photos from the phone live on the job with the notes, where the office and the crew can see them.",
      },
      {
        q: "Does it ask for reviews?",
        a: "Yes. After a payment lands, WorkBench asks the client for a review and links to your Google listing.",
      },
    ],
  },
  {
    slug: "christmas-lights",
    name: "Christmas lights",
    noun: "a Christmas light installation company",
    eyebrow: "For Christmas light installers",
    icon: Lightbulb,
    photo: WB_TRADE_PHOTOS.lights,
    shot: "schedule",
    chip: { title: "Install + takedown booked", sub: "Deposit paid · January visit set" },
    headline: ["Christmas light software for a season", "that is over in eight weeks."],
    intro:
      "A quote from a photo of the house, a deposit that holds the install date, a takedown visit already on the January calendar, and next year's customer list ready in October. WorkBench FSM is field service management software for seasonal crews, and the core of it is free.",
    description:
      "Free Christmas light installation software: quotes with e-signature and deposits, install and takedown scheduled as a pair, card payments, automatic reminders, and a client list that rebooks itself next season. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "Quote from the driveway or the photo",
        body: "Price the roofline, the trees, and the wreaths as line items from your price book, with the extras as toggles the homeowner picks. They sign on their phone and pay the deposit that holds the date.",
      },
      {
        title: "Install and takedown, scheduled together",
        body: "Book the install and the January takedown as one series, so the second visit is never forgotten. The crew sees both on the calendar, and the client gets a reminder before each.",
      },
      {
        title: "Next season starts from this one",
        body: "Every client, every roofline measurement, and every photo stays on the job. In October, send last year's list a rebook link and the season fills itself.",
      },
    ],
    features: ["Quotes with e-signature", "Deposits up front", "Recurring visit series", "Jobs with notes & photos", "Automatic notifications", "Card & ACH built in"],
    faq: [
      {
        q: "Can I take a deposit when they accept the quote?",
        a: "Yes. A quote can require a deposit at signing, by card or bank transfer, and the install date is only confirmed once it lands. The balance is invoiced after the install.",
      },
      {
        q: "How do I keep track of takedowns in January?",
        a: "Book the install and the takedown as a two-visit series when the quote is accepted. Both land on the calendar with the client's details, and the takedown reminder goes out on its own.",
      },
      {
        q: "Can I rebook last year's customers?",
        a: "Yes. Clients, their jobs, and their photos stay in the account between seasons. Text or email last year's list a booking link in the fall, or let Atlas draft the message for you.",
      },
      {
        q: "Does it work for a crew that only runs part of the year?",
        a: "Yes. There is no monthly bill on the core plan, so an account that sits idle from February to October costs nothing. Add extra users for the season and remove them after.",
      },
    ],
  },
  {
    slug: "window-cleaning",
    name: "Window cleaning",
    noun: "a window cleaning company",
    eyebrow: "For window cleaning companies",
    icon: AppWindow,
    photo: WB_TRADE_PHOTOS.windows,
    shot: "schedule",
    chip: { title: "Quarterly series · 4 visits", sub: "Card on file · autopay" },
    headline: ["Window cleaning software for the route", "and the repeat customers."],
    intro:
      "Residential routes that repeat every quarter, storefronts that pay monthly, and a card on file so nobody chases a check. WorkBench FSM is field service management software built for window cleaners, and the core of it is free.",
    description:
      "Free window cleaning software: online booking, recurring visit series, route-friendly scheduling, saved cards with autopay, one-click invoicing, and review requests after each clean. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "Book once, repeat forever",
        body: "A new customer picks a time on your booking page. Turn that first visit into a quarterly or monthly series, and every future visit lands on the calendar in the same slot.",
      },
      {
        title: "Run the day in order",
        body: "The day view shows every stop in sequence with the address and the notes (gate code, the dog, which windows are extra). Drag a stop to move it, and the client is told automatically.",
      },
      {
        title: "Paid without asking",
        body: "Storefronts and recurring homes keep a card on file. The invoice sends itself after each visit and the card is charged, or the client pays from the link if they prefer.",
      },
    ],
    features: ["Online booking", "Recurring visit series", "Scheduling & dispatch", "Saved cards & autopay", "One-click invoicing", "Review requests"],
    faq: [
      {
        q: "Can I set a customer up to repeat every three months?",
        a: "Yes. Any job can become a visit series on whatever interval you choose: monthly, quarterly, twice a year. Each visit shows on the calendar and can be moved on its own without touching the rest.",
      },
      {
        q: "Can commercial accounts be billed monthly?",
        a: "Yes. A storefront can be billed per visit, on a monthly schedule, or on a saved card that charges automatically after each clean. All three run from the same job.",
      },
      {
        q: "Does it help me plan a route?",
        a: "The day view lists stops in order with addresses, and you can drag them into the sequence that makes sense. The optional Pro add-on includes Route Manager, which orders a day for you.",
      },
      {
        q: "Will it ask customers for a review?",
        a: "Yes. After a payment lands, WorkBench asks the client for a review and links to your Google listing, which is where most new window cleaning customers come from.",
      },
    ],
  },
  {
    slug: "junk-removal",
    name: "Junk removal",
    noun: "a junk removal company",
    eyebrow: "For junk removal companies",
    icon: Truck,
    photo: WB_TRADE_PHOTOS.junk,
    shot: "jobs",
    chip: { title: "Half-load quote · accepted", sub: "Paid on the spot by card" },
    headline: ["Junk removal software for same-day jobs", "and paid-on-the-spot pickups."],
    intro:
      "A booking from the website for this afternoon, a quote on the spot from the photos, and a card payment before the truck pulls away. WorkBench FSM is field service management software built for haulers, and the core of it is free.",
    description:
      "Free junk removal software: online booking with same-day slots, on-site quotes with e-signature, photos on every job, card payments from the driveway, review requests, and a client list that brings repeat business. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "Booked while you are on another job",
        body: "The booking page shows real open slots, including later today. The request lands on the schedule with the address, the photos the customer uploaded, and a description of the pile.",
      },
      {
        title: "Quote in the driveway",
        body: "Look at the load, pick the size from your price book, add the mattress or the fridge as line items, and they sign on your phone. The accepted quote becomes the job with no retyping.",
      },
      {
        title: "Paid before the truck leaves",
        body: "Send the invoice from the phone and the customer pays by card on the spot, or tap to pay in person. The before-and-after photos stay on the job for the dispute that never comes.",
      },
    ],
    features: ["Online booking", "Quotes with e-signature", "Jobs with notes & photos", "Card & ACH built in", "Review requests", "Lead pipeline"],
    faq: [
      {
        q: "Can customers book a same-day pickup?",
        a: "Yes. The booking page shows your real availability including today's open slots, and the booking lands on the calendar with the confirmation already sent.",
      },
      {
        q: "Can I quote by load size?",
        a: "Yes. Put your load sizes in the price book, quote the one that fits, and add single-item charges as line items. Optional extras are toggles the customer switches on before signing.",
      },
      {
        q: "Can I take payment on the spot?",
        a: "Yes. Send the invoice from your phone and the customer pays from the link, or take a card in person. The job is marked paid the moment it lands.",
      },
      {
        q: "What about realtors and property managers who call every month?",
        a: "They live in your client list with every past job, photo, and invoice. A property manager with several addresses is one client with many jobs, and they can see all of it in the client portal.",
      },
    ],
  },
  {
    slug: "painting",
    name: "Painting",
    noun: "a painting company",
    eyebrow: "For painting contractors",
    icon: PaintRoller,
    photo: WB_TRADE_PHOTOS.painting,
    shot: "quotes",
    chip: { title: "Interior quote · 3 rooms", sub: "Deposit paid · starts Monday" },
    headline: ["Painting contractor software for multi-day jobs", "and estimates that close."],
    intro:
      "An estimate with the trim and the ceilings as options the homeowner picks, a deposit before you buy paint, a three-day job on the calendar, and the final invoice paid when the tape comes off. WorkBench FSM is field service management software built for painters, and the core of it is free.",
    description:
      "Free painting contractor software: estimates with e-signature and optional add-ons, deposits before the job, multi-day scheduling, progress photos, one-click invoicing with card and ACH payments, and a client portal. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "Estimate with the options built in",
        body: "Price the walls, then add the trim, the ceilings, and the second coat as toggles the client switches on or off. They see the total change, sign on their phone, and pay the deposit.",
      },
      {
        title: "A job that runs three days",
        body: "Schedule the job across the days it takes, with the crew on each one. Photos of the prep and the progress go on the job from the phone, so the office can answer the client without calling you.",
      },
      {
        title: "Final walk-through, final invoice",
        body: "Convert the accepted estimate to the invoice in one click, less the deposit already paid. The client pays by card or bank transfer from the link, and WorkBench asks for the review.",
      },
    ],
    features: ["Quotes with e-signature", "Deposits up front", "Scheduling & dispatch", "Jobs with notes & photos", "One-click invoicing", "Client hub"],
    faq: [
      {
        q: "Can an estimate offer options like trim or ceilings?",
        a: "Yes. Optional line items are toggles the client switches on or off before they sign, so one estimate covers walls-only through the full repaint. The accepted version becomes the job.",
      },
      {
        q: "Can I schedule a job that takes several days?",
        a: "Yes. A job can span as many days as it takes, with the crew assigned per day. Move one day and the rest stay put, and the client is told about the change automatically.",
      },
      {
        q: "How does the deposit come off the final invoice?",
        a: "Automatically. When the estimate converts to the invoice, the deposit already paid is shown and subtracted, so the client sees the balance and nothing else.",
      },
      {
        q: "Can the client see progress photos?",
        a: "Photos on the job are yours by default. Share the ones you want through the client portal, where the client also sees the estimate, the invoice, and the payments.",
      },
    ],
  },
  {
    slug: "landscaping",
    name: "Landscaping",
    noun: "a landscaping company",
    eyebrow: "For landscaping companies",
    icon: Shovel,
    photo: WB_TRADE_PHOTOS.landscaping,
    shot: "schedule",
    chip: { title: "Crew of 3 · clocked in", sub: "Paver patio · day 2 of 4" },
    headline: ["Landscaping software for installs, maintenance,", "and the crew that does both."],
    intro:
      "A paver patio quoted with options and a deposit, a weekly maintenance route that bills itself, and a crew clocking in from the truck so you know what each job really cost. WorkBench FSM is field service management software built for landscapers, and the core of it is free.",
    description:
      "Free landscaping business software: quotes with e-signature and deposits for installs, recurring maintenance series with autopay, crew scheduling, clock-in with timesheets, job profitability, and a client portal. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "Installs quoted with options",
        body: "Price the patio from your price book, add the lighting and the planting as toggles the client picks, and they sign on their phone. The deposit lands before the materials are ordered.",
      },
      {
        title: "Maintenance that runs itself",
        body: "Set a weekly or biweekly series per property and every visit lands on the calendar. The client keeps a card on file, the invoice goes out after each visit, and the card is charged.",
      },
      {
        title: "Know what the job cost",
        body: "The crew clocks in on the job from the phone. Hours and materials roll up against the quote, so you can see which installs make money and which maintenance accounts need a price change.",
      },
    ],
    features: ["Quotes with e-signature", "Deposits up front", "Recurring visit series", "Time tracking & timesheets", "Job profitability", "Saved cards & autopay"],
    faq: [
      {
        q: "Can I run maintenance and installs in the same account?",
        a: "Yes. A maintenance account is a visit series that repeats on its own schedule; an install is a one-off job with a quote, a deposit, and as many days as it needs. Both share the client, the crew, and the calendar.",
      },
      {
        q: "Can the crew clock in without the office?",
        a: "Yes. Each person clocks in and out on the job from the phone app. Hours show on the timesheet and against the job, and the team map shows who is where.",
      },
      {
        q: "Can I see whether a job made money?",
        a: "Yes. Every job shows labor hours and materials against the quoted price, so the margin on each install and each maintenance route is visible without a spreadsheet.",
      },
      {
        q: "Can clients be charged automatically after each visit?",
        a: "Yes. A client can keep a card on file, and the invoice for each visit in a series charges it automatically. The client gets the receipt, and you get the deposit without the follow-up call.",
      },
    ],
  },
  {
    slug: "snow-removal",
    name: "Snow removal",
    noun: "a snow removal company",
    eyebrow: "For snow removal companies",
    icon: Snowflake,
    photo: WB_TRADE_PHOTOS.snow,
    shot: "clients",
    chip: { title: "Seasonal contract signed", sub: "Per-push billing · card on file" },
    headline: ["Snow removal software for 4 a.m. dispatch", "and contracts that bill themselves."],
    intro:
      "Seasonal contracts signed in October, a route the crew sees on their phones before dawn, a text to every client when their driveway is done, and per-push or seasonal billing that runs on the card on file. WorkBench FSM is field service management software built for snow contractors, and the core of it is free.",
    description:
      "Free snow removal software: seasonal agreements with e-signature, per-push or flat seasonal billing with autopay, early-morning dispatch, automatic client notifications, and a property list with the notes the plow driver needs. The core plan is free for a small team, not a trial.",
    steps: [
      {
        title: "Contracts signed before the first flake",
        body: "Send the seasonal agreement in the fall with the price, the trigger depth, and the terms. The client signs on their phone and puts a card on file, so the season is set before it starts.",
      },
      {
        title: "Dispatch from bed",
        body: "When the snow comes, put the route on the calendar and every driver sees their stops, in order, with the gate codes and the where-to-pile notes. Move a stop and the driver sees it instantly.",
      },
      {
        title: "Bill per push or per season",
        body: "Per-push accounts are invoiced after each visit and charged to the card on file. Seasonal accounts are billed on the schedule in the contract. Clients get a text when their property is cleared.",
      },
    ],
    features: ["Agreements & contracts", "Recurring billing, three ways", "Saved cards & autopay", "Scheduling & dispatch", "Automatic notifications", "Team map"],
    faq: [
      {
        q: "Can I bill some clients per push and others per season?",
        a: "Yes. Billing is set per client: per visit, on a fixed schedule, or charged automatically to a saved card. A seasonal contract and a per-push neighbor can be on the same route.",
      },
      {
        q: "Do clients get told when their driveway is cleared?",
        a: "Yes. Marking the stop done sends the client a text or email automatically, so the phone stops ringing at 5 a.m.",
      },
      {
        q: "Can I keep the plow notes for each property?",
        a: "Yes. Every property has notes and photos the driver sees on the stop: where to pile the snow, the drainage grate to avoid, the gate code. They carry over to every storm.",
      },
      {
        q: "What does the account cost in the summer?",
        a: "Nothing on the core plan. There is no monthly bill, so a snow-only company pays nothing between seasons and keeps every client and contract for the next one.",
      },
    ],
  },
];

export function tradeBySlug(slug: string): Trade | undefined {
  return TRADES.find((t) => t.slug === slug);
}

/** The free-plan question every trade page ends on. Numbers live on the pricing pages. */
export function freePlanFaq(trade: Trade): { q: string; a: string } {
  return {
    q: `Is WorkBench really free for ${trade.noun}?`,
    a: "Yes. The core plan is free with full access for a small team, not a trial, with no card and no clock. Extra users and the optional add-ons are flat monthly prices; the pricing page and the free plan page have the current numbers.",
  };
}
