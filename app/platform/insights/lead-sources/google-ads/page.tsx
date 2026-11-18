import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { loadAdsFeedStatus } from "@/lib/ads-conversions-server";
import { loadAdsConnectStatus } from "@/lib/google-ads";
import GoogleAdsClient from "./GoogleAdsClient";

export const dynamic = "force-dynamic";

/**
 * Insights → Lead sources → Report paid jobs to Google Ads. Two ways in:
 * Connect Google Ads (one sign-in, lib/google-ads.ts; shown when the server
 * has GOOGLE_ADS_* set) and the by-hand route (a private file Google Ads
 * fetches, lib/ads-conversions.ts). Plans: docs/plans/ads-connect-2026-11-18.md
 * and ads-conversions-2026-11-18.md. Owners and admins.
 */
export default async function GoogleAdsPage({ searchParams }: { searchParams: Promise<{ gads?: string; why?: string }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const { gads, why } = await searchParams;
  const [status, connect, company] = await Promise.all([
    loadAdsFeedStatus(actor.companyId),
    loadAdsConnectStatus(actor.companyId),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }),
  ]);
  return (
    <GoogleAdsClient
      initial={status}
      initialConnect={connect}
      timeZone={company?.timezone ?? "America/Chicago"}
      outcome={typeof gads === "string" ? gads.slice(0, 20) : null}
      outcomeWhy={typeof why === "string" ? why.slice(0, 300) : null}
    />
  );
}
