import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
import { ESTIMATOR_SELECT } from "@/lib/estimator-server";
import { specFromJson } from "@/lib/estimator";
import { sanitizePublicConfig } from "@/lib/estimator-public";
import { resumableBuildId } from "@/lib/estimator-build-jobs";
import { Suspense } from "react";
import ToolClient, { type LeadRow } from "./ToolClient";

export const metadata: Metadata = { title: "Estimate tool" };

const LEADS_MAX = 100;

function whoOf(c: { firstName: string; lastName: string; companyName: string | null } | null): string {
  if (!c) return "Someone";
  return `${c.firstName} ${c.lastName}`.trim() || c.companyName?.trim() || "Someone";
}

/** "Estimate: $1,234.50 (…)" on a request's details → 1234.5 */
function estimateFromDetails(details: string | null): number | null {
  const m = details?.match(/Estimate: \$([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * /app/estimates/[id] — one tool's home: overview, try it, change it with
 * Atlas or by hand, put it on the website, who used it (Leads), history.
 * Sellers get overview + try it + leads (their contacts); managers get
 * everything.
 */
export default async function ToolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string; prompt?: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const manager = isManager(actor.role);
  const { id } = await params;
  const sp = await searchParams;
  const [row, company] = await Promise.all([
    prisma.estimator.findFirst({ where: { id, companyId: actor.companyId, ...(manager ? {} : { isActive: true }) }, select: ESTIMATOR_SELECT }),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { slug: true, name: true, industry: true, timezone: true } }),
  ]);
  if (!row) notFound();
  const spec = specFromJson(row.spec);
  const scope = viaContactScope(actor);
  // who used it: website leads (requests) and quotes started from an in-app run
  const [resumeBuildId, requests, quotes] = await Promise.all([
    // an Atlas change to this tool still running (or waiting on answers)
    manager ? resumableBuildId(actor.companyId, row.id) : Promise.resolve(null),
    prisma.request.findMany({
      where: { companyId: actor.companyId, estimatorId: row.id, ...scope },
      orderBy: { createdAt: "desc" },
      take: LEADS_MAX,
      select: {
        id: true,
        status: true,
        createdAt: true,
        details: true,
        contactId: true,
        contact: { select: { firstName: true, lastName: true, companyName: true } },
        quotes: { orderBy: { createdAt: "desc" }, take: 1, select: { quoteNumber: true, total: true } },
      },
    }),
    prisma.quote.findMany({
      where: { companyId: actor.companyId, estimatorId: row.id, requestId: null, ...scope },
      orderBy: { createdAt: "desc" },
      take: LEADS_MAX,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        total: true,
        createdAt: true,
        contactId: true,
        contact: { select: { firstName: true, lastName: true, companyName: true } },
      },
    }),
  ]);
  const leads: LeadRow[] = [
    ...requests.map((r) => ({
      key: `r-${r.id}`,
      at: r.createdAt.toISOString(),
      contactId: r.contactId,
      contactName: whoOf(r.contact),
      via: "Web form" as const,
      amount: r.quotes[0] ? Number(r.quotes[0].total) : estimateFromDetails(r.details),
      status: { kind: "request" as const, value: r.status },
      href: `/app/requests/${r.id}`,
      ...(r.quotes[0] ? { quoteNumber: r.quotes[0].quoteNumber } : {}),
    })),
    ...quotes.map((q) => ({
      key: `q-${q.id}`,
      at: q.createdAt.toISOString(),
      contactId: q.contactId,
      contactName: whoOf(q.contact),
      via: "In app" as const,
      amount: Number(q.total),
      status: { kind: "quote" as const, value: q.status },
      href: `/app/quotes/${q.id}`,
      quoteNumber: q.quoteNumber,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LEADS_MAX);

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
        tz={company?.timezone ?? "America/Chicago"}
        leads={leads}
        initialSection={typeof sp.s === "string" ? sp.s : undefined}
        initialPrompt={manager && typeof sp.prompt === "string" ? sp.prompt.slice(0, 4000) : ""}
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
