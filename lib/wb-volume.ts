import { unstable_cache } from "next/cache";
import { prisma as db } from "@/lib/db";
import { DEMO_COMPANY_SLUG } from "@/lib/demo-company-shared";

/**
 * The home page's "Running on WorkBench" counter (David 2026-11-19): real
 * totals across every live business — jobs completed and money paid to
 * those businesses through WorkBench.
 *
 * Counted: jobs that are done (a completedAt stamp, waiting to be invoiced,
 * or archived with an invoice); payments as they stand now (Payment.amount
 * is already reduced by refunds and zeroed by bank returns, so the sum never
 * overstates).
 *
 * Left out: WorkBench's own billing company (Company.isPlatform — its
 * payments are plan charges paid TO WorkBench), the Brightwire demo company,
 * the e2e harness tenants, and our own Streamflaire accounts. NOT left out:
 * Company.isTest — the first real customers carry it so every plan gate
 * opens for them (2026-11-20: filtering on it left the counter at 0).
 * WB_VOLUME_EXCLUDE (comma-separated slugs) drops more without a deploy of
 * code.
 *
 * The section stays hidden until both totals pass VOLUME_SHOW_MIN (David:
 * "we can hide it until it reaches a certain amount").
 */

export type Volume = { jobs: number; paidCents: number };

/** Internal companies whose jobs and payments are not a business's. */
const INTERNAL_SLUGS = [DEMO_COMPANY_SLUG, "streamflare-demo-co", "streamflaire", "streamflaire-admin"];

/** Below these the counter is not shown on the live site. */
export const VOLUME_SHOW_MIN: Volume = { jobs: 10_000, paidCents: 1_000_000_00 };

export function volumeShowable(v: Volume | null): v is Volume {
  return !!v && v.jobs >= VOLUME_SHOW_MIN.jobs && v.paidCents >= VOLUME_SHOW_MIN.paidCents;
}

async function readVolume(): Promise<Volume | null> {
  // Local previews have no production database: WB_VOLUME_OVERRIDE="jobs,cents"
  // stands in (development only).
  const override = process.env.NODE_ENV !== "production" ? process.env.WB_VOLUME_OVERRIDE : undefined;
  if (override) {
    const [jobs, paidCents] = override.split(",").map((n) => Number(n));
    if (Number.isFinite(jobs) && Number.isFinite(paidCents)) return { jobs, paidCents };
  }
  try {
    const extra = (process.env.WB_VOLUME_EXCLUDE ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const live = {
      isPlatform: false,
      slug: { notIn: [...INTERNAL_SLUGS, ...extra] },
      NOT: { slug: { startsWith: "e2e-" } },
    };
    const [jobs, paid] = await Promise.all([
      db.job.count({
        where: {
          company: live,
          OR: [{ completedAt: { not: null } }, { status: "REQUIRES_INVOICING" }, { status: "ARCHIVED", invoice: { isNot: null } }],
        },
      }),
      db.payment.aggregate({ _sum: { amount: true }, where: { company: live } }),
    ]);
    const dollars = Number(paid._sum.amount ?? 0);
    return { jobs, paidCents: Math.round(dollars * 100) };
  } catch {
    return null;
  }
}

/** Cached for an hour: the page never waits on two table scans. */
export const loadVolume = unstable_cache(readVolume, ["wb-volume"], { revalidate: 3600 });
