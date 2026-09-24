import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import { ESTIMATOR_SELECT, runnerEstimators } from "@/lib/estimator-server";
import { sanitizePublicConfig } from "@/lib/estimator-public";
import { resumableBuildId } from "@/lib/estimator-build-jobs";
import { INDUSTRIES } from "@/lib/pricebooks";
import { pickSort, ESTIMATE_SORTS } from "@/lib/list-sort";
import EstimatesClient, { type EstimatesFilter, type Tool } from "./EstimatesClient";

export const metadata: Metadata = { title: "Estimates" };

const FILTERS: EstimatesFilter[] = ["", "published", "off"];

/**
 * /app/estimates — ONE page doing both jobs, like Agreements: the tools
 * you've built (`?view=tools`, the default) and the Library other
 * businesses share (`?view=library`). Sellers see and run the active tools;
 * managers also get the builder and the edit/website actions. Search
 * (?q=), the status filter (?status=) and the sort (?sort=) ride in the
 * URL like every other list page (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 5; list redesign Batches 11–12).
 */
export default async function EstimatesPage({ searchParams }: { searchParams: Promise<{ prompt?: string; run?: string; q?: string; status?: string; sort?: string; view?: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const manager = isManager(actor.role);
  const sp = await searchParams;
  const view: "tools" | "library" = sp.view === "library" ? "library" : "tools";
  const [rows, company] = await Promise.all([
    prisma.estimator.findMany({
      where: { companyId: actor.companyId, ...(manager ? {} : { isActive: true }) },
      select: ESTIMATOR_SELECT,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true, timezone: true, industry: true } }),
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
  const sort = pickSort(sp.sort, ESTIMATE_SORTS);
  const query = sp.q?.trim() ?? "";
  const q = query.toLowerCase();
  const tools = all
    .filter((t) => {
      if (filter === "published" && !(t.isPublic && t.publicSlug)) return false;
      if (filter === "off" && t.isActive) return false;
      if (q && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "runs") return b.runs + b.submissions - (a.runs + a.submissions) || b.updatedAt.localeCompare(a.updatedAt);
      // updated: live tools first, newest change on top (the query order)
      return 0;
    });

  const industry = company?.industry && (INDUSTRIES as readonly string[]).includes(company.industry) && company.industry !== "Other" ? company.industry : "";
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");
  return (
    <EstimatesClient
      manager={manager}
      companySlug={company?.slug ?? ""}
      baseUrl={baseUrl}
      tz={company?.timezone ?? "America/Chicago"}
      view={view}
      libraryIndustry={industry}
      initialPrompt={manager && typeof sp.prompt === "string" ? sp.prompt.slice(0, 4000) : ""}
      autoRun={sp.run === "1"}
      resumeBuildId={resumeBuildId}
      tools={tools}
      totalCount={all.length}
      filter={filter}
      sort={sort}
      query={query}
      brokenCount={manager ? rows.length - compiled.length : 0}
    />
  );
}
