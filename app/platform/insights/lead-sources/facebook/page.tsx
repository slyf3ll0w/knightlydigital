import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { loadMetaAdsStatus } from "@/lib/meta-ads";
import { loadMetaLeadsStatus } from "@/lib/meta-leads";
import FacebookAdsClient from "./FacebookAdsClient";

export const dynamic = "force-dynamic";

/**
 * Insights → Lead sources → Facebook ads. Two halves: leads from Facebook
 * forms arrive by themselves (Connect Facebook, lib/meta-leads.ts; shown when
 * the server has META_* set), and Facebook is told which of its leads became
 * booked and paid work (lib/meta-ads.ts). Plan:
 * docs/plans/facebook-ads-2026-11-20.md. Owners and admins.
 */
export default async function FacebookAdsPage({ searchParams }: { searchParams: Promise<{ fb?: string; why?: string }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const { fb, why } = await searchParams;
  const [status, leads, company] = await Promise.all([
    loadMetaAdsStatus(actor.companyId),
    loadMetaLeadsStatus(actor.companyId),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }),
  ]);
  return (
    <FacebookAdsClient
      initial={status}
      initialLeads={leads}
      timeZone={company?.timezone ?? "America/Chicago"}
      outcome={typeof fb === "string" ? fb.slice(0, 20) : null}
      outcomeWhy={typeof why === "string" ? why.slice(0, 300) : null}
    />
  );
}
