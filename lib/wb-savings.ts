import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, PLANS, PROCESSING_RATES, formatCents } from "@/lib/plans";

/**
 * "You're paying card fees already" — the savings estimate on the pricing
 * page, the free plan page and Home. Pure math over two kinds of numbers:
 *
 * - WorkBench's own (seats, Pro, processing) come from lib/plans.ts like
 *   every other page, so a price change lands here on the same deploy.
 * - The competitors' published list prices live below with the date they
 *   were read and the page they were read from. scripts/test-wb-savings.ts
 *   fails once SAVINGS_AS_OF is older than a year, so they get re-checked
 *   instead of quietly going stale. Annual-commitment prices are used
 *   (the lower ones), the cheapest plan that covers the team is picked, and
 *   the others' processing is costed at the benchmark rate — every choice
 *   leans in the competitor's favour so the estimate understates rather
 *   than oversells.
 */

/** The day the competitor numbers below were read from the vendors' pricing pages. */
export const SAVINGS_AS_OF = "2026-10-28";

/** What a business pays for online card payments almost anywhere. */
export const BENCHMARK = {
  label: "2.9% + 30¢",
  cardBps: 290,
  cardFixedCents: 30,
  note: "Stripe's standard online card rate and Jobber Payments' published card rate",
  sources: [
    { name: "Stripe pricing", url: "https://stripe.com/pricing" },
    { name: "Jobber pricing", url: "https://www.getjobber.com/pricing/" },
  ],
} as const;

export type CompetitorPlan = {
  name: string;
  usersIncluded: number;
  /** Per month on an annual commitment, in cents. */
  monthlyCents: number;
  /** Per extra user per month, when the vendor sells extra seats on this plan. */
  extraUserCents?: number;
};

export type Competitor = {
  id: "jobber" | "housecall-pro";
  name: string;
  sourceUrl: string;
  plans: CompetitorPlan[];
  /** Card processing the business pays on online payments. */
  cardBps: number;
  cardFixedCents: number;
  rateNote: string;
};

export const COMPETITORS: Competitor[] = [
  {
    id: "jobber",
    name: "Jobber",
    sourceUrl: "https://www.getjobber.com/pricing/",
    // getjobber.com/pricing, "All prices in USD", annual-prepaid price per
    // month after the promotional months. Core is sold for one user only.
    plans: [
      { name: "Core", usersIncluded: 1, monthlyCents: 2_900 },
      { name: "Connect", usersIncluded: 1, monthlyCents: 9_900, extraUserCents: 2_900 },
      { name: "Connect", usersIncluded: 5, monthlyCents: 14_900, extraUserCents: 2_900 },
      { name: "Connect", usersIncluded: 10, monthlyCents: 22_900, extraUserCents: 2_900 },
      { name: "Connect", usersIncluded: 15, monthlyCents: 29_900, extraUserCents: 2_900 },
    ],
    cardBps: 290,
    cardFixedCents: 30,
    rateNote: "Jobber Payments' published card rate, 2.9% + 30¢, the same on every plan",
  },
  {
    id: "housecall-pro",
    name: "Housecall Pro",
    sourceUrl: "https://www.housecallpro.com/pricing/",
    // housecallpro.com/pricing, billed annually. Extra users are only
    // offered on Max ($35 a month each).
    plans: [
      { name: "Basic", usersIncluded: 1, monthlyCents: 5_900 },
      { name: "Essentials", usersIncluded: 5, monthlyCents: 14_900 },
      { name: "Max", usersIncluded: 8, monthlyCents: 29_900, extraUserCents: 3_500 },
    ],
    cardBps: BENCHMARK.cardBps,
    cardFixedCents: BENCHMARK.cardFixedCents,
    rateNote: `Housecall Pro publishes "as low as 2.59%" and no online-invoice rate, so its processing is costed at the ${BENCHMARK.label} benchmark`,
  },
];

export type SavingsInput = {
  users: number;
  /** Card volume a month, in cents. */
  monthlyVolumeCents: number;
  /** Typical invoice, in cents (sets how many fixed per-transaction fees apply). */
  avgTicketCents: number;
  /** Who pays WorkBench's processing fee. */
  model: "company" | "client";
};

export type CostLine = { label: string; softwareCents: number; processingCents: number; totalCents: number };

export type SavingsEstimate = {
  workbench: CostLine & { processingNote: string };
  benchmarkProcessingCents: number;
  competitors: (CostLine & { id: Competitor["id"]; name: string; savingsYearCents: number })[];
};

export function processingCents(volumeCents: number, avgTicketCents: number, bps: number, fixedCents: number): number {
  if (volumeCents <= 0) return 0;
  const transactions = avgTicketCents > 0 ? volumeCents / avgTicketCents : 0;
  return Math.round((volumeCents * bps) / 10_000 + transactions * fixedCents);
}

/** The cheapest published plan that covers `users`, with extra seats where the vendor sells them. */
export function cheapestPlan(c: Competitor, users: number): { plan: CompetitorPlan; monthlyCents: number; label: string } {
  let best: { plan: CompetitorPlan; monthlyCents: number } | null = null;
  for (const plan of c.plans) {
    const over = Math.max(0, users - plan.usersIncluded);
    if (over > 0 && plan.extraUserCents == null) continue;
    const monthly = plan.monthlyCents + over * (plan.extraUserCents ?? 0);
    if (!best || monthly < best.monthlyCents) best = { plan, monthlyCents: monthly };
  }
  if (!best) {
    // Past every published tier: the largest plan, extra seats at its rate.
    const top = [...c.plans].sort((a, b) => b.usersIncluded - a.usersIncluded)[0];
    const over = Math.max(0, users - top.usersIncluded);
    best = { plan: top, monthlyCents: top.monthlyCents + over * (top.extraUserCents ?? 0) };
  }
  const label = users > best.plan.usersIncluded ? `${best.plan.name} + ${users - best.plan.usersIncluded} extra` : best.plan.name;
  return { ...best, label };
}

/** WorkBench's software cost: extra seats, or Pro when that is cheaper. */
export function workbenchSoftware(users: number): { cents: number; label: string } {
  const seats = Math.max(0, users - INCLUDED_SEATS) * EXTRA_SEAT_CENTS;
  const pro = PLANS.SHOP.monthlyCents;
  if (seats === 0) return { cents: 0, label: "Core, free" };
  if (pro < seats) return { cents: pro, label: `${PLANS.SHOP.name}, unlimited users` };
  return { cents: seats, label: `Core + ${users - INCLUDED_SEATS} extra` };
}

export function estimate(input: SavingsInput): SavingsEstimate {
  const { users, monthlyVolumeCents, avgTicketCents, model } = input;
  const r = PROCESSING_RATES.companyPaid;
  const wbSoftware = workbenchSoftware(users);
  const wbProcessing = model === "client" ? 0 : processingCents(monthlyVolumeCents, avgTicketCents, r.cardBps, r.cardFixedCents);
  const benchmark = processingCents(monthlyVolumeCents, avgTicketCents, BENCHMARK.cardBps, BENCHMARK.cardFixedCents);
  const wbTotal = wbSoftware.cents + wbProcessing;
  const competitors = COMPETITORS.map((c) => {
    const plan = cheapestPlan(c, users);
    const processing = processingCents(monthlyVolumeCents, avgTicketCents, c.cardBps, c.cardFixedCents);
    const total = plan.monthlyCents + processing;
    return {
      id: c.id,
      name: c.name,
      label: plan.label,
      softwareCents: plan.monthlyCents,
      processingCents: processing,
      totalCents: total,
      savingsYearCents: (total - wbTotal) * 12,
    };
  });
  return {
    workbench: {
      label: wbSoftware.label,
      softwareCents: wbSoftware.cents,
      processingCents: wbProcessing,
      totalCents: wbTotal,
      processingNote:
        model === "client"
          ? "Your client pays the service fee at checkout; you receive the full invoice."
          : wbProcessing >= benchmark
            ? `${formatCents(wbProcessing - benchmark)} a month more than the ${BENCHMARK.label} benchmark, already counted.`
            : `${formatCents(benchmark - wbProcessing)} a month less than the ${BENCHMARK.label} benchmark.`,
    },
    benchmarkProcessingCents: benchmark,
    competitors,
  };
}

/** Three shops shown as worked examples; computed, never typed. */
export const EXAMPLE_SHOPS: ({ label: string } & Omit<SavingsInput, "model">)[] = [
  { label: "A one-person handyman", users: 1, monthlyVolumeCents: 8_000_00, avgTicketCents: 250_00 },
  { label: "A three-person plumbing company", users: 3, monthlyVolumeCents: 25_000_00, avgTicketCents: 450_00 },
  { label: "A six-person HVAC company", users: 6, monthlyVolumeCents: 60_000_00, avgTicketCents: 900_00 },
];

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso + "T00:00:00Z").getTime()) / 86_400_000);
}

/** "$1,430" — whole dollars for the big numbers. */
export function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
