import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { loadMetaAdsStatus } from "@/lib/meta-ads";
import FacebookAdsClient from "./FacebookAdsClient";

export const dynamic = "force-dynamic";

/**
 * Insights → Lead sources → Facebook ads. Tells Facebook which of its leads
 * became booked and paid work (lib/meta-ads.ts). Plan:
 * docs/plans/facebook-ads-2026-11-20.md. Owners and admins.
 */
export default async function FacebookAdsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const [status, company] = await Promise.all([
    loadMetaAdsStatus(actor.companyId),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }),
  ]);
  return <FacebookAdsClient initial={status} timeZone={company?.timezone ?? "America/Chicago"} />;
}
