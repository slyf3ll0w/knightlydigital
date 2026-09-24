import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import { ESTIMATOR_SELECT, runnerEstimators } from "@/lib/estimator-server";
import { sanitizePublicConfig } from "@/lib/estimator-public";
import { resumableBuildId } from "@/lib/estimator-build-jobs";
import EstimatesClient, { type EstimatesFilter, type Tool } from "./EstimatesClient";

export const metadata: Metadata = { title: "Estimates" };

const FILTERS: EstimatesFilter[] = ["", "published", "off"];

/**
 * /app/estimates — build, run, change and publish estimate tools
 * (docs/plans/ai-estimators-2026-09-19.md, Batch 5; list redesign Batch 11).
 * Sellers see and run the active tools; managers also get the builder and
 * the edit/website actions. Search (?q=) and the status filter (?status=)
 * ride in the URL like every other list page, so the phone search bar and
 * the segmented filter work the same way here.
 */
export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ prompt?: string; run?: string; q?: string; status?: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const manager = isManager(actor.role);
  const sp = await searchParams;
  const [rows, company] = await Promise.all([
    prisma.estimator.findMany({
      where: { companyId: actor.companyId, ...(manager ? {} : { isActive: true }) },
      select: ESTIMATOR_SELECT,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true } }),
  ]);
  // a new-tool build still running (or waiting on answers) — the builder picks it up
  const resumeBuildId = manager ? await resumableBuildId(actor.companyId, null) : null;
  const compiled = runnerEstimators(rows, { includeInactive: manager });
  const all: Tool[] = compiled.map((t) => {
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
      sourceListingId: row.sourceListingId,
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  const filter: EstimatesFilter = FILTERS.includes((sp.status ?? "") as EstimatesFilter) ? ((sp.status ?? "") as EstimatesFilter) : "";
  const query = sp.q?.trim() ?? "";
  const q = query.toLowerCase();
  const tools = all.filter((t) => {
    if (filter === "published" && !(t.isPublic && t.publicSlug)) return false;
    if (filter === "off" && t.isActive) return false;
    if (q && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");
  return (
    <EstimatesClient
      manager={manager}
      companySlug={company?.slug ?? ""}
      baseUrl={baseUrl}
      initialPrompt={manager && typeof sp.prompt === "string" ? sp.prompt.slice(0, 4000) : ""}
      autoRun={sp.run === "1"}
      resumeBuildId={resumeBuildId}
      tools={tools}
      totals={{
        all: all.length,
        active: all.filter((t) => t.isActive).length,
        published: all.filter((t) => t.isPublic && t.publicSlug).length,
        off: all.filter((t) => !t.isActive).length,
        runs: all.reduce((s, t) => s + t.runs, 0),
        leads: all.reduce((s, t) => s + t.submissions, 0),
      }}
      filter={filter}
      query={query}
      brokenCount={manager ? rows.length - compiled.length : 0}
    />
  );
}
