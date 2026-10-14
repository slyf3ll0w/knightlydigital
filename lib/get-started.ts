import { prisma } from "@/lib/db";

/**
 * The Get started checklist on Home (app/platform/dashboard/GetStartedCard.tsx).
 *
 * Every item ticks itself from real data — nobody marks anything done by
 * hand — so the card is always honest about where a new company stands.
 * It replaced the single "Your price book is ready" card, which promised a
 * seeded price book to companies whose free-text industry had seeded
 * nothing (audit 2026-10-12). Two items need a stamp the model can't see
 * (Company.bookingLinkSharedAt, Company.mobileAppSeenAt); the rest are
 * counts.
 *
 * Shown to every company — new or long-standing — until Hide stamps
 * Company.getStartedHiddenAt or every core item is done. The stamp is the
 * checklist's own (not the old setupWizardAt, which every account from the
 * wizard days carries), so an active company that never finished setting
 * up sees the card with the steps it has done already ticked. Settings →
 * Company → "Show on Home" clears the stamp (POST /api/app/setup/restore).
 */
export type GetStartedItem = {
  key: string;
  title: string;
  sub: string;
  href: string;
  done: boolean;
  optional?: boolean;
};

export type GetStarted = {
  items: GetStartedItem[];
  /** Core items done / core items total. */
  done: number;
  total: number;
  /** Every core item is done — the card hides itself. */
  complete: boolean;
};

/** What the checklist is judged from: the company's stamps and live counts. */
export type GetStartedFacts = {
  phone: string | null;
  address: string | null;
  businessHours: unknown;
  bookingLinkSharedAt: Date | null;
  mobileAppSeenAt: Date | null;
  services: number;
  clients: number;
  quotes: number;
  jobs: number;
  people: number;
  /** Users seen from the iPhone/Android app (0 when mobileAppSeenAt is set — that stamp wins). */
  onPhone: number;
};

export async function loadGetStarted(companyId: string): Promise<GetStarted | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      getStartedHiddenAt: true,
      phone: true,
      address: true,
      businessHours: true,
      bookingLinkSharedAt: true,
      mobileAppSeenAt: true,
    },
  });
  if (!company || company.getStartedHiddenAt) return null;

  const [services, clients, quotes, jobs, people, onPhone] = await Promise.all([
    prisma.workItem.count({ where: { companyId, isActive: true } }),
    prisma.contact.count({ where: { companyId, placeholder: false } }),
    prisma.quote.count({ where: { companyId, status: { not: "DRAFT" } } }),
    prisma.job.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId, isActive: true } }),
    // Companies older than the mobileAppSeenAt stamp: someone has signed in
    // from the iPhone/Android app, or turned on push there.
    company.mobileAppSeenAt
      ? Promise.resolve(1)
      : prisma.user.count({
          where: {
            companyId,
            OR: [
              { lastSeenVia: { in: ["ios", "android"] } },
              { pushSubscriptions: { some: { platform: { not: "web" } } } },
            ],
          },
        }),
  ]);

  const result = buildGetStarted({ ...company, services, clients, quotes, jobs, people, onPhone });
  // Finished is finished: every tick is a live count, so deleting the only
  // client later would otherwise bring the card back to Home. The same stamp
  // Hide writes; Settings → Company → Show on Home clears it.
  if (result.complete) await prisma.company.updateMany({ where: { id: companyId, getStartedHiddenAt: null }, data: { getStartedHiddenAt: new Date() } });
  return result;
}

/** The checklist from its facts — pure, so the ticking rules have a unit test (scripts/test-get-started.ts). */
export function buildGetStarted(f: GetStartedFacts): GetStarted {
  const { services, clients, quotes, jobs, people } = f;
  const onPhone = f.mobileAppSeenAt ? 1 : f.onPhone;
  const company = f;
  const items: GetStartedItem[] = [
    {
      key: "services",
      title: services > 0 ? "Review your prices" : "Add your services",
      sub:
        services > 0
          ? "Your price book is loaded — check the prices are yours."
          : "Quotes, jobs and invoices fill themselves in from your price book.",
      href: "/app/settings/products",
      done: services > 0,
    },
    {
      key: "details",
      title: "Fill in your business details",
      sub: "Phone, address, logo and brand color — on your booking page and every document.",
      href: "/app/settings?s=company",
      done: Boolean(company.phone?.trim()) && Boolean(company.address?.trim()),
    },
    {
      key: "hours",
      title: "Set your business hours",
      sub: "Booking and scheduling use them to know when you're open.",
      href: "/app/settings/booking",
      done: company.businessHours != null,
    },
    {
      key: "client",
      title: "Add your first client",
      sub: "Type one in, or import your whole list from a spreadsheet.",
      href: "/app/contacts/new",
      done: clients > 0,
    },
    {
      key: "quote",
      title: "Send your first quote",
      sub: "Clients approve it online and it turns into a job.",
      href: "/app/quotes/new",
      done: quotes > 0,
    },
    {
      key: "job",
      title: "Schedule your first job",
      sub: "It lands on your calendar and your phone.",
      href: "/app/jobs/new",
      done: jobs > 0,
    },
    {
      key: "booking",
      title: "Share your booking page",
      sub: "Copy the link for your website, Google profile or texts.",
      href: "/app/settings/booking",
      done: company.bookingLinkSharedAt != null,
    },
    {
      key: "team",
      title: "Add your team",
      sub: "Each person gets their own login and schedule.",
      href: "/app/settings/team",
      done: people > 1,
      optional: true,
    },
    {
      key: "app",
      title: "Install the app on your phone",
      sub: "Calls, texts and the day's jobs in your pocket.",
      href: "/app/help/mobile-apps",
      done: onPhone > 0,
      optional: true,
    },
  ];

  const core = items.filter((i) => !i.optional);
  const done = core.filter((i) => i.done).length;
  return { items, done, total: core.length, complete: done === core.length };
}

/** First beat from a native-app install: the company has the app. Once. */
export async function stampMobileAppSeen(companyId: string): Promise<void> {
  await prisma.company.updateMany({
    where: { id: companyId, mobileAppSeenAt: null },
    data: { mobileAppSeenAt: new Date() },
  });
}
