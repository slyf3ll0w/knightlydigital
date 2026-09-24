import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import { ESTIMATOR_SELECT } from "@/lib/estimator-server";
import { specFromJson } from "@/lib/estimator";
import { sanitizePublicConfig } from "@/lib/estimator-public";
import { resumableBuildId } from "@/lib/estimator-build-jobs";
import { Suspense } from "react";
import ToolClient from "./ToolClient";

export const metadata: Metadata = { title: "Estimate tool" };

/**
 * /app/estimates/[id] — one tool's home: overview, try it, change it with
 * Atlas or by hand, put it on the website, history. Sellers get overview +
 * try it; managers get everything.
 */
export default async function ToolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const manager = isManager(actor.role);
  const { id } = await params;
  const sp = await searchParams;
  const [row, company] = await Promise.all([
    prisma.estimator.findFirst({ where: { id, companyId: actor.companyId, ...(manager ? {} : { isActive: true }) }, select: ESTIMATOR_SELECT }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true, name: true, industry: true } }),
  ]);
  if (!row) notFound();
  const spec = specFromJson(row.spec);
  // an Atlas change to this tool still running (or waiting on answers)
  const resumeBuildId = manager ? await resumableBuildId(actor.companyId, row.id) : null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");
  return (
    // useSearchParams inside — a Suspense boundary keeps Next quiet about it
    <Suspense fallback={null}>
    <ToolClient
      manager={manager}
      companySlug={company?.slug ?? ""}
      companyName={company?.name ?? ""}
      companyIndustry={company?.industry ?? null}
      baseUrl={baseUrl}
      initialSection={typeof sp.s === "string" ? sp.s : undefined}
      resumeBuildId={resumeBuildId}
      tool={{
        id: row.id,
        name: row.name,
        description: row.description,
        spec,
        usesAtlas: Boolean(spec?.assist),
        isActive: row.isActive,
        runs: row.runs,
        assists: row.assists,
        isPublic: row.isPublic,
        publicSlug: row.publicSlug,
        publicConfig: sanitizePublicConfig(row.publicConfig),
        publicViews: row.publicViews,
        publicCalcs: row.publicCalcs,
        submissions: row.submissions,
        sourceListingId: row.sourceListingId,
        updatedAt: row.updatedAt.toISOString(),
      }}
    />
    </Suspense>
  );
}
