import { WB_DAY_PHOTOS, WB_PHOTOS } from "@/lib/wb-site";
import type { ShotKey } from "@/lib/wb-trades";

/**
 * The "free <thing> software" landing pages (/free-invoicing-software,
 * /free-scheduling-software), on the feature-page template. Each is one
 * search intent: the person wants that one thing free, and the page shows
 * that one thing working. NUMBER-FREE by rule (scripts/test-wb-site.ts);
 * seats, prices and rates come through the template from lib/plans.
 * The free plan itself is /free-field-service-software (lib/wb-free.ts).
 */

export type FreePage = {
  path: string;
  eyebrow: string;
  title: string;
  headline: [string, string];
  intro: string;
  description: string;
  photo: { src: string; alt: string };
  shot: ShotKey;
  chip: { title: string; sub: string };
  steps: { title: string; body: string }[];
  /** Exact titles from lib/wb-features.ts. */
  features: string[];
  faq: { q: string; a: string }[];
  /** Links under the page. */
  related: { label: string; href: string }[];
};

export const FREE_PAGES: FreePage[] = [
  {
    path: "/free-invoicing-software",
    eyebrow: "Free invoicing",
    title: "Free invoicing software for contractors",
    headline: ["Free invoicing software for contractors,", "with the payment link built in."],
    intro:
      "Send the invoice from the driveway, let the client pay by card or bank transfer from the link, and let the reminders go out on their own. WorkBench FSM's invoicing is part of a free core plan, not a trial, for plumbers, electricians, HVAC, lawn care, cleaning and every home-service trade.",
    description:
      "Free invoicing software for contractors and home-service companies: one-click invoices from the job, a pay-by-card or bank link, automatic payment reminders, saved cards and autopay, deposits, and a client portal. Part of WorkBench FSM's free core plan, not a trial.",
    photo: WB_PHOTOS.paid,
    shot: "invoices",
    chip: { title: "Invoice paid", sub: "By card, from the link" },
    steps: [
      { title: "Invoice from the job", body: "The job's line items become the invoice in one click, with your logo, your price book names, and the sales tax you set once. Edit anything before it goes." },
      { title: "The client pays from a link", body: "Send it by email or text. The client taps the link and pays by card or bank transfer on their phone, with no account to make. The invoice marks itself paid." },
      { title: "Reminders without the awkward call", body: "An unpaid invoice gets a reminder on the due date and again after, in your business's name, until it is paid. Clients who keep a card on file can be charged automatically." },
    ],
    features: ["One-click invoicing", "Card & ACH built in", "Payment reminders", "Saved cards & autopay", "Deposits up front", "Products & services price book", "Client hub", "Payouts & refunds", "Know when they've looked"],
    faq: [
      {
        q: "Is the invoicing really free?",
        a: "Yes. Invoicing, the pay link, reminders, the price book and the client portal are all in the free core plan, which has no card and no clock. WorkBench earns a flat processing fee when a client pays through the link, or the client pays a service fee instead; the pricing page has the current rates.",
      },
      {
        q: "Do I need to connect a bank or a payment account?",
        a: "To take card and bank payments through the link, yes: you connect a Square account, which pays out to your bank. You can make and send invoices before that, and clients can pay you however you take payment today.",
      },
      {
        q: "Can I just make an invoice without an account?",
        a: "Yes. The free invoice generator makes a PDF with your logo in the browser, no account needed. If you later want the client to pay it online, the same invoice can open an account.",
      },
      {
        q: "Does it do recurring invoices?",
        a: "Yes. A monthly plan bills a flat amount on the card on file; per-visit billing invoices after each completed visit, or once a month for all of them. Both are in the free core.",
      },
      {
        q: "Does it sync with QuickBooks?",
        a: "QuickBooks Online sync is on the Pro add-on. Invoices, payments and clients flow to QuickBooks nightly once it is connected.",
      },
    ],
    related: [
      { label: "Free invoice generator", href: "/tools/invoice-generator" },
      { label: "Quotes & invoicing, in depth", href: "/features/quotes-and-invoicing" },
      { label: "Payments", href: "/features/payments" },
      { label: "Free scheduling software", href: "/free-scheduling-software" },
    ],
  },
  {
    path: "/free-scheduling-software",
    eyebrow: "Free scheduling",
    title: "Free scheduling software for small service businesses",
    headline: ["Free scheduling software", "for small service businesses."],
    intro:
      "A drag-to-schedule calendar, online booking that shows your real open times, reminders that go out on their own, and the day in order on every tech's phone. WorkBench FSM's scheduling is part of a free core plan, not a trial.",
    description:
      "Free scheduling software for small service businesses: a drag-and-drop calendar, online booking with real availability, automatic confirmations and reminders, recurring visits, Google Calendar sync and a phone app for the crew. Part of WorkBench FSM's free core plan, not a trial.",
    photo: WB_DAY_PHOTOS.morning,
    shot: "schedule",
    chip: { title: "Tuesday, 9:00", sub: "Booked online · reminder sent" },
    steps: [
      { title: "Book it, or let them", body: "Put a job on the calendar from the phone, or let the client pick a real open time on your booking page or embedded form. Either way it lands with the address, the notes and who is taking it." },
      { title: "Move things without the phone calls", body: "Drag a job to a new slot and the client is told automatically. The day view shows every stop in order, and the crew sees their own day on the phone app." },
      { title: "Reminders that go out on their own", body: "A confirmation when it is booked, a reminder the day before and again an hour out, in your business's name. Fewer no-shows, no texting from the truck." },
    ],
    features: ["Scheduling & dispatch", "Online booking", "Automatic notifications", "Recurring visit series", "Google Calendar sync", "Jobs with notes & photos", "Team chat", "Roles & permissions", "Time tracking & timesheets"],
    faq: [
      {
        q: "Is the scheduling really free?",
        a: "Yes. The calendar, online booking, reminders, recurring visits, Google Calendar sync and the phone app are all in the free core plan, with no card and no clock. The pricing page explains what WorkBench charges for instead.",
      },
      {
        q: "Can clients book online?",
        a: "Yes. The booking page shows your real availability, so a client picks a time that is actually open. It also runs as a form on your website. Paid services can take a card at booking.",
      },
      {
        q: "Does it work for a team?",
        a: "Yes. Each person has their own calendar and sees their own day on the phone. The free core includes a small team; extra people are a flat price each, or unlimited on the Pro add-on, which also adds the team map and timesheets.",
      },
      {
        q: "Does it sync with Google Calendar?",
        a: "Yes, both ways. Jobs and appointments appear on your Google Calendar, and busy times from Google block your booking availability so nobody books over them.",
      },
      {
        q: "Does it do route planning?",
        a: "The day view orders stops and shows drive times. Route optimization, which reorders a day for the least driving, is on the Pro add-on.",
      },
    ],
    related: [
      { label: "Scheduling & dispatch, in depth", href: "/features/scheduling-dispatch" },
      { label: "Online booking", href: "/features/scheduling-dispatch" },
      { label: "Free invoicing software", href: "/free-invoicing-software" },
      { label: "Free estimate generator", href: "/tools/estimate-generator" },
    ],
  },
];

export function freePageByPath(path: string): FreePage | undefined {
  return FREE_PAGES.find((p) => p.path === path);
}
