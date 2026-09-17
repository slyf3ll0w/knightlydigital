import { sections } from "@/lib/wb-features";

/**
 * Everything WorkBench does, as draggable cards for the packaging board
 * (/superadmin/packaging).
 *
 * Two sources, one list:
 *   1. lib/wb-features.ts — the marketing catalog, read live so a title or
 *      body edited there follows through to the board on the next sync.
 *   2. EXTRA_FEATURES below — the real capabilities that never made the
 *      /features page (Atlas, mobile, QuickBooks, branding, support, …).
 *      Add to this list when a feature ships and it appears on the board.
 *
 * Each card carries a stable `key`. Sync is additive and keyed on it, so a
 * card already dragged into a tier is never moved, duplicated, or reworded
 * by a later sync — only genuinely new features get added, into Unassigned.
 */

export type CatalogFeature = {
  key: string;
  title: string;
  body: string;
  group: string;
  icon: string; // lucide-react export name
};

/** "Quotes with e-signature" → "quotes-with-e-signature" */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Features the marketing catalog doesn't list — the back office, the phone,
 * the platform itself, and the things Workbench Plus currently promises.
 */
const EXTRA_FEATURES: CatalogFeature[] = [
  // ── Atlas ──
  {
    key: "extra:atlas-assistant",
    title: "Atlas AI assistant",
    body: "An assistant that works the same tools the team does — scheduling, quotes, invoices, messages — with the same permissions, and confirms before anything goes out the door.",
    group: "Atlas AI",
    icon: "Compass",
  },
  {
    key: "extra:atlas-tokens",
    title: "Atlas token allowance",
    body: "The metered part: a monthly pool of Atlas tokens per account. Every reply shows what it used and Atlas never spends past the allowance.",
    group: "Atlas AI",
    icon: "Sparkles",
  },
  {
    key: "extra:atlas-setup-wizard",
    title: "AI setup wizard",
    body: "A guided first-run that builds the price book, booking form, and pipeline from a few answers about the business.",
    group: "Atlas AI",
    icon: "Bot",
  },

  // ── Mobile ──
  {
    key: "extra:mobile-app",
    title: "Native iPhone & Android app",
    body: "The whole app on the phone, on the App Store and Play Store — not a bookmark to the website.",
    group: "Mobile",
    icon: "Smartphone",
  },
  {
    key: "extra:push",
    title: "Push notifications",
    body: "New requests, bookings, chat messages, and payments land on the phone the moment they happen.",
    group: "Mobile",
    icon: "BellRing",
  },
  {
    key: "extra:offline",
    title: "Offline on the job site",
    body: "Today's schedule and job details stay viewable with no signal — basements, crawl spaces, and dead zones included.",
    group: "Mobile",
    icon: "WifiOff",
  },
  {
    key: "extra:truck-mode",
    title: "Truck mode & Up Next",
    body: "A field-first home screen: the next job front and center, one-tap arrival, navigation, and clock-in without hunting through menus.",
    group: "Mobile",
    icon: "Truck",
  },

  // ── Office & admin ──
  {
    key: "extra:insights",
    title: "Insights & reporting",
    body: "Revenue, jobs, and pipeline trends over time — where the money came from and what it cost to earn.",
    group: "Office & admin",
    icon: "BarChart3",
  },
  {
    key: "extra:expenses",
    title: "Expenses & recurring expenses",
    body: "Log materials, subscriptions, and overhead — one-off or repeating — so profitability counts real costs.",
    group: "Office & admin",
    icon: "Receipt",
  },
  {
    key: "extra:quickbooks",
    title: "QuickBooks Online sync",
    body: "Clients, invoices, and payments flow into QuickBooks so the books match the app without double entry.",
    group: "Office & admin",
    icon: "RefreshCcw",
  },
  {
    key: "extra:import",
    title: "Client import",
    body: "Bring an existing client list in from a spreadsheet — mapped, deduped, and ready on day one.",
    group: "Office & admin",
    icon: "Upload",
  },
  {
    key: "extra:custom-fields",
    title: "Custom client fields",
    body: "Track the things this trade cares about — gate codes, equipment models, warranty dates — as first-class fields on every client.",
    group: "Office & admin",
    icon: "ListPlus",
  },
  {
    key: "extra:activity-log",
    title: "Activity log",
    body: "A running record of who changed what and when, across jobs, quotes, invoices, and clients.",
    group: "Office & admin",
    icon: "History",
  },
  {
    key: "extra:photo-storage",
    title: "Job photo storage",
    body: "Before/after photos stored against the job, kept off the phone's camera roll and available to the office.",
    group: "Office & admin",
    icon: "Images",
  },
  {
    key: "extra:unlimited-seats",
    title: "Unlimited team seats",
    body: "Every dispatcher, tech, and salesperson gets a login. No per-seat math.",
    group: "Office & admin",
    icon: "UsersRound",
  },
  {
    key: "extra:multi-company",
    title: "Multiple companies on one login",
    body: "Run more than one business from a single account and switch between them without signing out.",
    group: "Office & admin",
    icon: "Building2",
  },

  // ── Brand & comms ──
  {
    key: "extra:branding",
    title: "Branding & appearance",
    body: "Logo, brand colors, document colors, fonts, wallpapers, and sidebar theme — the app and everything a client sees wears the company's colors.",
    group: "Brand & comms",
    icon: "Palette",
  },
  {
    key: "extra:email-domain",
    title: "Send from your own domain",
    body: "Client emails go out from the company's own address instead of the platform's, verified through DNS.",
    group: "Brand & comms",
    icon: "AtSign",
  },
  {
    key: "extra:sms",
    title: "Text (SMS) notifications",
    body: "Confirmations, reminders, and on-my-way texts sent from the business, with replies routed back into the shared inbox.",
    group: "Brand & comms",
    icon: "MessageCircle",
  },
  {
    key: "extra:booking-page",
    title: "Hosted booking page",
    body: "A branded public page for companies without a website — the booking form, the services, and the company's look, on its own link.",
    group: "Brand & comms",
    icon: "Globe",
  },
  {
    key: "extra:web-forms",
    title: "Website forms & embeds",
    body: "Contact and request forms to drop into an existing website, feeding the same pipeline as everything else.",
    group: "Brand & comms",
    icon: "ClipboardList",
  },

  // ── Scheduling extras ──
  {
    key: "extra:route-manager",
    title: "Route manager & drive-time booking",
    body: "Day routes built from the shop outward, and online booking that only offers slots clustering with the tech's existing route.",
    group: "Run the day",
    icon: "Route",
  },

  // ── Platform ──
  {
    key: "extra:support-tickets",
    title: "In-app support tickets",
    body: "Report a bug or suggest a feature without leaving the app, and watch it move.",
    group: "Platform",
    icon: "LifeBuoy",
  },
  {
    key: "extra:roadmap",
    title: "Roadmap & feature voting",
    body: "See what's being built next and vote on what matters to the business.",
    group: "Platform",
    icon: "Map",
  },
  {
    key: "extra:priority-support",
    title: "Priority support",
    body: "Support requests jump the queue, with a named person on the other end.",
    group: "Platform",
    icon: "Headset",
  },
  {
    key: "extra:early-access",
    title: "Early access to new features",
    body: "New features land here first, before general release.",
    group: "Platform",
    icon: "Rocket",
  },
  {
    key: "extra:advanced-reporting",
    title: "Advanced reporting",
    body: "Deeper cuts of the numbers than the standard Insights page — the current Workbench Plus promise.",
    group: "Platform",
    icon: "TrendingUp",
  },
];

/**
 * Every feature, marketing catalog first (in page order), then the extras.
 * The icon name comes off the lucide component's displayName, so the board
 * and the /features page never disagree about which glyph a feature wears.
 */
export function catalogFeatures(): CatalogFeature[] {
  const fromMarketing: CatalogFeature[] = sections.flatMap((section) =>
    section.items.map((item) => ({
      key: `${section.id}:${slug(item.title)}`,
      title: item.title,
      body: item.body,
      group: section.title,
      icon:
        (item.icon as unknown as { displayName?: string }).displayName ?? "Layers",
    }))
  );
  return [...fromMarketing, ...EXTRA_FEATURES];
}

/** The lanes a fresh board starts with. The backlog is always first. */
export const STARTER_LANES: {
  name: string;
  kind: "BACKLOG" | "TIER" | "ADDON";
  price: string | null;
  priceNote: string | null;
  blurb: string | null;
  accent: string | null;
}[] = [
  {
    name: "Unassigned",
    kind: "BACKLOG",
    price: null,
    priceNote: null,
    blurb: "Everything WorkBench does, waiting to be placed.",
    accent: null,
  },
  {
    name: "Free Tier",
    kind: "TIER",
    price: "$0",
    priceNote: "forever, unlimited seats",
    blurb: "The generous free plan — funded by payment processing.",
    accent: "#0B57D8",
  },
  {
    name: "Workbench Plus",
    kind: "TIER",
    price: "$29",
    priceNote: "per company, per month",
    blurb: "The paid tier for companies that want more than the essentials.",
    accent: "#F86A0A",
  },
];
