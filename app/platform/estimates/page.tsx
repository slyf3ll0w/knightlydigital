import type { Metadata } from "next";
import { ESTIMATOR_LIBRARY_ENABLED } from "@/lib/estimator-library-flag";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
import EstimatesPicture, { type PricedQuote } from "@/components/EstimatesPicture";
import { ESTIMATOR_SELECT, loadPriceBook, missingItemsOf, runnerEstimators } from "@/lib/estimator-server";
import { sanitizePublicConfig } from "@/lib/estimator-public";
import { resumableBuildId } from "@/lib/estimator-build-jobs";
import { INDUSTRIES } from "@/lib/pricebooks";
import { pickSort, ESTIMATE_SORTS } from "@/lib/list-sort";
import { featureAllowedFor } from "@/lib/plan-gate";
import PlanRequired from "@/components/PlanRequired";
import EstimatesClient, { type EstimatesFilter, type Tool } from "./EstimatesClient";

export const metadata: Metadata = { title: "Estimator tools" };

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
  // The Estimator and its Library are Pro (quotes themselves are free).
  if (!(await featureAllowedFor(actor.companyId, "estimator")))
    return <PlanRequired feature="estimator" back={{ href: "/app/quotes", label: "Back to quotes" }} />;
  const manager = isManager(actor.role);
  const sp = await searchParams;
  // The Library is archived (lib/estimator-library-flag.ts): ?view=library shows the tools
  const view: "tools" | "library" = ESTIMATOR_LIBRARY_ENABLED && sp.view === "library" ? "library" : "tools";
  const [rows, company, book] = await Promise.all([
    prisma.estimator.findMany({
      where: { companyId: actor.companyId, ...(manager ? {} : { isActive: true }) },
      select: ESTIMATOR_SELECT,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true, timezone: true, industry: true } }),
    loadPriceBook(actor.companyId),
  ]);
  // The picture: every quote a tool priced in the last 60 days, and the website leads its forms sent.
  const since = new Date(Date.now() - 60 * 86_400_000);
  const scope = viaContactScope(actor);
  const [pricedRows, leads] =
    view === "tools" && rows.length > 0
      ? await Promise.all([
          prisma.quote.findMany({
            where: { companyId: actor.companyId, estimatorId: { not: null }, createdAt: { gte: since }, ...scope },
            orderBy: { createdAt: "desc" },
            take: 300,
            select: {
              id: true,
              quoteNumber: true,
              status: true,
              total: true,
              estimator: { select: { name: true } },
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          }),
          prisma.request.count({ where: { companyId: actor.companyId, estimatorId: { not: null }, createdAt: { gte: since }, ...scope } }),
        ])
      : [[], 0];
  const priced: PricedQuote[] = pricedRows.map((q) => ({
    id: q.id,
    number: String(q.quoteNumber),
    status: q.status,
    total: Number(q.total ?? 0),
    tool: q.estimator?.name ?? "Tool",
    client: q.contact ? q.contact.companyName?.trim() || `${q.contact.firstName} ${q.contact.lastName}`.trim() : "No client",
  }));

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
      missingItems: missingItemsOf(row.spec, book),
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
      picture={view === "tools" && rows.length > 0 ? <EstimatesPicture quotes={priced} leads={leads} /> : null}
    />
  );
}
