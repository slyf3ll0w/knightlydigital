import {
  ArrowRight,
  Banknote,
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarRange,
  Camera,
  ClipboardCheck,
  Clock4,
  CreditCard,
  Eye,
  FileText,
  Globe,
  HandCoins,
  KanbanSquare,
  Keyboard,
  MapPin,
  MessageSquare,
  PenLine,
  RefreshCcw,
  Repeat,
  Star,
  Users,
} from "lucide-react";

/**
 * Single source of truth for the "every feature" catalog: the /features hub
 * page and the per-topic deep-dive pages (/features/[topic]) both render
 * from this list, so a feature's title/body never drifts between the two.
 */

export type FeatureItem = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
};

export type FeatureSection = {
  id: string;
  num: string;
  title: string;
  kicker: string;
  accent: string;
  chip: string;
  items: FeatureItem[];
};

export const sections: FeatureSection[] = [
  {
    id: "win",
    num: "01",
    title: "Win the work",
    kicker:
      "From the first website visit to a signed quote — intake that fills the calendar instead of the voicemail box.",
    accent: "text-[#0B57D8]",
    chip: "bg-blue-50 text-[#0B57D8]",
    items: [
      {
        icon: Globe,
        title: "Online booking",
        body: "An embeddable booking widget for your website that shows real availability. Jobs that need a look first go through an approval loop instead of landing straight on the calendar.",
      },
      {
        icon: KanbanSquare,
        title: "Lead pipeline",
        body: "A drag-and-drop board over your contacts with custom stages. Cards advance themselves when a request comes in, an appointment is set, or a quote goes out — and land in Converted when the job is won.",
      },
      {
        icon: ArrowRight,
        title: "Lead webhook",
        body: "A plug-in endpoint for your lead sources — Zapier, Make, Meta lead ads, Google lead forms. New leads drop onto the board the moment they exist.",
      },
      {
        icon: FileText,
        title: "Quotes with e-signature",
        body: "Line items, optional add-ons the client can toggle, discounts, and deposits. Clients review and sign from their phone; accepted quotes convert to jobs in one click.",
      },
      {
        icon: BellRing,
        title: "Quote follow-ups",
        body: "A quote that sits unanswered gets a friendly nudge at 3 and 7 days, automatically. No more spreadsheet of “need to call back.”",
      },
      {
        icon: HandCoins,
        title: "Deposits up front",
        body: "Collect a deposit at quote approval — card or bank transfer — so the job is funded before the truck rolls.",
      },
    ],
  },
  {
    id: "run",
    num: "02",
    title: "Run the day",
    kicker: "Dispatch, field work, and the crew — everything between “scheduled” and “done.”",
    accent: "text-[#F86A0A]",
    chip: "bg-orange-50 text-[#F86A0A]",
    items: [
      {
        icon: CalendarClock,
        title: "Scheduling & dispatch",
        body: "Month, week, and day views with drag-to-schedule, time blocks, and per-tech filtering. The calendar is the command center, not a read-only report.",
      },
      {
        icon: CalendarRange,
        title: "Recurring visit series",
        body: "Weekly mows, quarterly filter changes, biweekly cleans — visit schedules generate real jobs weeks ahead that dispatchers can drag, reschedule, or skip one at a time.",
      },
      {
        icon: Camera,
        title: "Jobs with notes & photos",
        body: "Every job carries its history: status, notes, and before/after photos from the field, so the office and the crew see the same thing.",
      },
      {
        icon: Clock4,
        title: "Time tracking & timesheets",
        body: "Techs clock in and out right on the job. Weekly timesheets roll up per person, managers can fix a forgotten clock-out, and logged hours flow into each job's profit margin as real labor cost.",
      },
      {
        icon: MapPin,
        title: "Team map",
        body: "See who's on the clock and where — a live map of clocked-in techs. Location is only ever collected while someone is clocked in, never off hours.",
      },
      {
        icon: MessageSquare,
        title: "Team chat",
        body: "A company channel, direct messages, and group threads with push notifications — job details stop living in six different text conversations.",
      },
      {
        icon: Users,
        title: "Roles & permissions",
        body: "Owner, admin, sales, and tech roles out of the box, each seeing what they need and nothing they don't. Every seat is free.",
      },
      {
        icon: Keyboard,
        title: "Built for speed",
        body: "A command palette and keyboard shortcuts across the whole app — jump anywhere, create anything, without touching the mouse.",
      },
    ],
  },
  {
    id: "paid",
    num: "03",
    title: "Get paid",
    kicker: "Invoices go out in one click, money comes back on rails — and the chasing happens automatically.",
    accent: "text-[#0B57D8]",
    chip: "bg-blue-50 text-[#0B57D8]",
    items: [
      {
        icon: CreditCard,
        title: "Card & ACH built in",
        body: "Every invoice, quote, and booking can take card or bank payments at one flat rate — 2.9% + 30¢ per card transaction, 0.75% ACH. No monthly fees, no minimums.",
      },
      {
        icon: ClipboardCheck,
        title: "One-click invoicing",
        body: "Finish a job, send the invoice. Clients pay from a link on their phone; deposits and partial payments are first-class, not a workaround.",
      },
      {
        icon: RefreshCcw,
        title: "Saved cards & autopay",
        body: "Clients keep a card on file, recurring work charges itself, and a declined card retries on a smart schedule with the client nudged to update it — before you ever have to make the awkward call.",
      },
      {
        icon: Repeat,
        title: "Recurring billing, three ways",
        body: "Flat monthly plans, bill-after-each-visit, or per-visit work consolidated into one tidy monthly invoice with a dated line per visit. Pick per client.",
      },
      {
        icon: BellRing,
        title: "Payment reminders",
        body: "Unpaid invoices get escalating reminders — on the due date, then 3, 7, and 14 days after — that stop the moment the money lands.",
      },
      {
        icon: Banknote,
        title: "Payouts & refunds",
        body: "Payouts go straight to your bank on an automatic schedule, and a refund is one button — full or partial — with the records kept clean for your bookkeeper.",
      },
      {
        icon: BookOpen,
        title: "Products & services price book",
        body: "Your services live in one price book with set rates — quotes and invoices pull from it, and a service can be marked recurring to start a plan automatically when it sells.",
      },
      {
        icon: HandCoins,
        title: "Job profitability",
        body: "Each job shows its margin — revenue against materials and real labor cost from the time clock — so you know which work is worth chasing.",
      },
    ],
  },
  {
    id: "clients",
    num: "04",
    title: "Keep clients close",
    kicker: "A client experience that looks like a company twice your size — without hiring anyone.",
    accent: "text-[#F86A0A]",
    chip: "bg-orange-50 text-[#F86A0A]",
    items: [
      {
        icon: PenLine,
        title: "Client hub",
        body: "A magic-link portal — no account, no password — where clients see upcoming visits, review invoices, sign agreements, request more work, and pay.",
      },
      {
        icon: MessageSquare,
        title: "Two-way messaging",
        body: "Clients message from the hub, your team answers from one shared inbox with unread counts — so the conversation lives in one place instead of six text threads.",
      },
      {
        icon: BellRing,
        title: "Automatic notifications",
        body: "Booking confirmations, visit reminders the day before and an hour out, payment receipts — all sent from your business, all without anyone remembering to do it.",
      },
      {
        icon: FileText,
        title: "Agreements & contracts",
        body: "Service agreements and contracts with e-signature, stored on the client and visible in their hub.",
      },
      {
        icon: Eye,
        title: "Know when they've looked",
        body: "See when a client opens a quote or document, so you follow up at the right moment instead of guessing.",
      },
      {
        icon: Star,
        title: "Review requests",
        body: "After a payment lands, WorkBench asks the happy client for a review and points them at your Google listing while the goodwill is fresh.",
      },
    ],
  },
];

export const APP_STORE_URL = "https://apps.apple.com/app/workbench-fsm/id6789991103";

/** Look up one feature item by its section id + exact title. Throws loudly
 * in dev if a deep-dive page's reference to the catalog goes stale. */
export function pickFeatures(sectionId: string, titles: string[]): FeatureItem[] {
  const section = sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`wb-features: unknown section "${sectionId}"`);
  return titles.map((title) => {
    const item = section.items.find((i) => i.title === title);
    if (!item) throw new Error(`wb-features: "${title}" not found in section "${sectionId}"`);
    return item;
  });
}
