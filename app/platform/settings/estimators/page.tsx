import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { ESTIMATOR_SELECT, runnerEstimators } from "@/lib/estimator-server";
import { sanitizePublicConfig } from "@/lib/estimator-public";
import EstimatorsClient from "./EstimatorsClient";

export const metadata: Metadata = { title: "Estimate tools" };

export default async function EstimatorsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const [rows, company] = await Promise.all([
    prisma.estimator.findMany({
      where: { companyId: actor.companyId },
      select: ESTIMATOR_SELECT,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true } }),
  ]);
  const tools = runnerEstimators(rows, { includeInactive: true });
  // The website form's link + snippet point at this deployment
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");
  return (
    <EstimatorsClient
      companySlug={company?.slug ?? ""}
      baseUrl={baseUrl}
      tools={tools.map((t) => {
        const row = rows.find((r) => r.id === t.id)!;
        return {
          ...t,
          isActive: row.isActive,
          runs: row.runs,
          assists: row.assists,
          isPublic: row.isPublic,
          publicSlug: row.publicSlug,
          publicConfig: sanitizePublicConfig(row.publicConfig),
          publicViews: row.publicViews,
          publicCalcs: row.publicCalcs,
          submissions: row.submissions,
          updatedAt: row.updatedAt.toISOString(),
        };
      })}
      brokenCount={rows.length - tools.length}
    />
  );
}
