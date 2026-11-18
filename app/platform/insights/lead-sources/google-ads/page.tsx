import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { loadAdsFeedStatus } from "@/lib/ads-conversions-server";
import GoogleAdsClient from "./GoogleAdsClient";

export const dynamic = "force-dynamic";

/**
 * Insights → Lead sources → Report paid jobs to Google Ads (2026-11-18):
 * turn on the private file Google Ads fetches, see what it holds, and the
 * one-time setup on Google's side. Rules: lib/ads-conversions.ts; plan:
 * docs/plans/ads-conversions-2026-11-18.md. Owners and admins.
 */
export default async function GoogleAdsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const [status, company] = await Promise.all([
    loadAdsFeedStatus(actor.companyId),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }),
  ]);
  return <GoogleAdsClient initial={status} timeZone={company?.timezone ?? "America/Chicago"} />;
}
