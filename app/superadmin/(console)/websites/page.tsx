import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import { sanitizeBrief, briefGaps } from "@/lib/website-brief";
import { appBaseUrl, dispatchConfigured, isTokenRejectedError } from "@/lib/website";
import WebsitesClient, { type WebsiteRow } from "./WebsitesClient";

export const dynamic = "force-dynamic";

/**
 * The studio queue: every company that opened Settings → Website, newest
 * brief first. Status, domain, Pages project, preview, studio notes,
 * "Rebuild now". The brief itself opens in a drawer; the site data link is
 * what a build reads.
 */
export default async function ConsoleWebsitesPage() {
  await requireSuperadminPage();
  const rows = await prisma.website.findMany({
    orderBy: [{ briefSubmittedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
    take: 200,
    include: {
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          industry: true,
          city: true,
          state: true,
          website: true,
          _count: { select: { websitePhotos: true } },
        },
      },
    },
  });
  const flagged = await prisma.jobPhoto.groupBy({
    by: ["jobId"],
    where: { siteUse: true, job: { companyId: { in: rows.map((r) => r.companyId) } } },
    _count: { _all: true },
  });
  // jobId → companyId for the flagged counts
  const jobs = flagged.length
    ? await prisma.job.findMany({ where: { id: { in: flagged.map((f) => f.jobId) } }, select: { id: true, companyId: true } })
    : [];
  const jobCompany = new Map(jobs.map((j) => [j.id, j.companyId]));
  const flaggedByCompany = new Map<string, number>();
  for (const f of flagged) {
    const c = jobCompany.get(f.jobId);
    if (c) flaggedByCompany.set(c, (flaggedByCompany.get(c) ?? 0) + f._count._all);
  }

  const base = appBaseUrl();
  const data: WebsiteRow[] = rows.map((r) => {
    const brief = sanitizeBrief(r.brief);
    const photoCount = r.company._count.websitePhotos + (flaggedByCompany.get(r.companyId) ?? 0);
    return {
      companyId: r.companyId,
      companyName: r.company.name,
      slug: r.company.slug,
      industry: r.company.industry,
      place: [r.company.city, r.company.state].filter(Boolean).join(", "),
      companyWebsite: r.company.website,
      status: r.status,
      brief,
      gaps: briefGaps(brief, photoCount).map((g) => g.label),
      photoCount,
      briefSubmittedAt: r.briefSubmittedAt?.toISOString() ?? null,
      domain: r.domain,
      pagesProject: r.pagesProject,
      previewUrl: r.previewUrl,
      direction: r.direction,
      notes: r.notes,
      liveAt: r.liveAt?.toISOString() ?? null,
      rebuildQueuedAt: r.rebuildQueuedAt?.toISOString() ?? null,
      rebuildSentAt: r.rebuildSentAt?.toISOString() ?? null,
      rebuildReason: r.rebuildReason,
      rebuildError: r.rebuildError,
      siteDataUrl: `${base}/api/public/site/${r.company.slug}`,
      bookingUrl: `${base}/book/${r.company.slug}`,
    };
  });

  // The token is set but GitHub refused it on the last dispatch of some
  // row: rebuilds are being recorded and dropped until it is re-minted.
  const tokenRejected = dispatchConfigured() && rows.some((r) => isTokenRejectedError(r.rebuildError));

  return <WebsitesClient rows={data} dispatchConfigured={dispatchConfigured()} tokenRejected={tokenRejected} />;
}
