/**
 * Client websites (docs/plans/client-websites-2026-10-05.md).
 *
 * The site itself is a static Astro project in the separate workbench-sites
 * repo, one per client. This module is the app's side of it:
 *
 *  - `loadSiteData(slug)` — everything a site build needs, as one JSON
 *    document (GET /api/public/site/[slug]). The build reads it at build
 *    time, so hours, phone, services and photos never go stale on the site.
 *  - `scheduleSiteRebuild(companyId, reason)` — debounced; sends a GitHub
 *    `repository_dispatch` to workbench-sites (its Actions workflow builds
 *    the one site and deploys it to Cloudflare Pages). Fired by the Prisma
 *    middleware in lib/db.ts on relevant writes, by the console's "Rebuild
 *    now", and by the Settings page when the owner saves the brief.
 *
 * Env: SITES_DISPATCH_TOKEN (GitHub fine-grained PAT: contents + actions
 * write on the sites repo). Unset = rebuilds are recorded as queued and
 * nothing is sent — the rest of the feature works without it.
 */

import { reportError } from "@/lib/report-error";
import { prisma } from "@/lib/db";
import { resolvePublicCompany } from "@/lib/public-company";
import { sanitizeBusinessHours, type BusinessHours } from "@/lib/business-hours";
import { listPublicBookingTypes, menuTypes } from "@/lib/booking-runtime";
import { sanitizeBrief, publicBrief, emptyBrief, briefGaps, type WebsiteBrief, type BriefGap } from "@/lib/website-brief";
import type { WebsiteStatus } from "@prisma/client";

export const SITE_DATA_VERSION = 1;

// The owner-facing status words live in lib/website-shared.ts so the client
// component can import them without pulling Prisma in (audit 2026-10-06, G8).
export { WEBSITE_STATUS_LABEL } from "@/lib/website-shared";

/** Statuses whose site exists somewhere a rebuild can land. */
const REBUILDABLE: ReadonlySet<WebsiteStatus> = new Set(["IN_STUDIO", "REVIEW", "LIVE"]);

/**
 * Is there a site to feed? The public data endpoint answers 404 for every
 * other status: until the studio has the brief, the company's email, street
 * address, coordinates, hours, price book and booking items have no business
 * being one unauthenticated GET away (audit 2026-10-06, F3). Pure.
 */
export function siteIsPublic(status: WebsiteStatus | null | undefined): boolean {
  return Boolean(status && REBUILDABLE.has(status));
}

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");
}

// ─── Site data (what a build reads) ──────────────────────────────────────────

export type SitePhoto = {
  id: string;
  url: string;
  alt: string;
  caption: string;
  /** truck | team | shop | work | other (uploads), or before | after | general (job photos) */
  kind: string;
  source: "upload" | "job";
  takenAt: string;
};

export type SiteService = {
  id: string;
  name: string;
  description: string;
  /** Dollars; null when the brief hides prices or the item has none */
  price: number | null;
  priceDisplay: string;
};

export type SiteBookingItem = {
  slug: string;
  name: string;
  description: string;
  kind: string;
  mode: string;
  /** Hosted page */
  url: string;
  /** Iframe source (posts `jobflow:height` for auto-resize) */
  embedUrl: string;
};

export type SiteData = {
  v: typeof SITE_DATA_VERSION;
  generatedAt: string;
  company: {
    name: string;
    legalName: string | null;
    slug: string;
    phone: string | null;
    /** The business line (E.164) when they have one — what tap-to-call should dial */
    linePhone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    lat: number | null;
    lng: number | null;
    website: string | null;
    about: string | null;
    industry: string | null;
    timezone: string;
    logoUrl: string | null;
    brandColor: string | null;
    brandColorSecondary: string | null;
    brandFont: string | null;
    reviewLink: string | null;
    hours: BusinessHours | null;
  };
  services: SiteService[];
  booking: { pageUrl: string; items: SiteBookingItem[] };
  legal: { privacyUrl: string; smsTermsUrl: string };
  brief: WebsiteBrief;
  photos: SitePhoto[];
  website: {
    status: WebsiteStatus;
    domain: string | null;
    previewUrl: string | null;
    direction: string | null;
  };
};

function abs(path: string): string {
  return `${appBaseUrl()}${path}`;
}

/**
 * The company's site data, or null when there is nothing to serve: the slug
 * matches nobody, the company is suspended or not yet approved (the same
 * gate as the booking pages, lib/public-company.ts), or its website is not
 * in the studio / in review / live. What IS served is what the site shows:
 * the legal name only when the owner turned it on for clients, the brief
 * only once it was sent to the studio, and job photos by their alt text —
 * never the tech's caption.
 */
export async function loadSiteData(slug: string): Promise<SiteData | null> {
  const company = await resolvePublicCompany(slug);
  if (!company) return null;
  const site = await prisma.website.findUnique({ where: { companyId: company.id } });
  if (!site || !siteIsPublic(site.status)) return null;

  const [items, uploads, jobPhotos, listed] = await Promise.all([
    prisma.workItem.findMany({
      where: { companyId: company.id, isActive: true, type: "SERVICE" },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, description: true, unitPrice: true, priceDisplay: true },
      take: 60,
    }),
    prisma.websitePhoto.findMany({
      where: { companyId: company.id },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      select: { id: true, alt: true, caption: true, kind: true, createdAt: true },
    }),
    prisma.jobPhoto.findMany({
      where: { siteUse: true, job: { companyId: company.id } },
      orderBy: { createdAt: "desc" },
      select: { id: true, alt: true, type: true, createdAt: true },
      take: 60,
    }),
    // Gate already passed above (resolvePublicCompany)
    listPublicBookingTypes(company.slug, { skipGate: true }).catch(() => null),
  ]);

  // A half-typed brief autosaves on every pause; it is nobody's business
  // until the owner presses Send to the studio (F4).
  const brief = site.briefSubmittedAt ? publicBrief(sanitizeBrief(site.brief)) : emptyBrief();
  const base = appBaseUrl();
  const bookingItems: SiteBookingItem[] = (listed ? menuTypes(listed.types) : []).map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description ?? "",
    kind: t.kind,
    mode: t.mode,
    url: `${base}/book/${company.slug}/${t.slug}`,
    embedUrl: `${base}/embed/${company.slug}/${t.slug}`,
  }));

  // A line number not yet provisioned sits as a `pending:<id>` claim token
  const linePhone = company.lineNumber && company.lineNumber.startsWith("+") ? company.lineNumber : null;
  // Only the uploaded logo is served by the app (/api/logo/<id>); an
  // external logo URL is passed through as-is.
  const logoUrl = company.logoUrl ? (company.logoUrl.startsWith("/") ? abs(company.logoUrl) : company.logoUrl) : null;

  return {
    v: SITE_DATA_VERSION,
    generatedAt: new Date().toISOString(),
    company: {
      name: company.name,
      legalName: publicLegalName(company),
      slug: company.slug,
      phone: company.phone,
      linePhone,
      email: company.email,
      address: company.address,
      city: company.city,
      state: company.state,
      zip: company.zip,
      lat: company.lat,
      lng: company.lng,
      website: company.website,
      about: company.about,
      industry: company.industry,
      timezone: company.timezone,
      logoUrl,
      brandColor: company.brandColor,
      brandColorSecondary: company.brandColorSecondary,
      brandFont: company.brandFont,
      reviewLink: company.reviewLink,
      hours: company.businessHours ? sanitizeBusinessHours(company.businessHours) : null,
    },
    services: items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? "",
      price: brief.showPrices && i.unitPrice ? Number(i.unitPrice) : null,
      priceDisplay: String(i.priceDisplay),
    })),
    booking: { pageUrl: `${base}/book/${company.slug}`, items: bookingItems },
    legal: {
      privacyUrl: `${base}/book/${company.slug}/privacy`,
      smsTermsUrl: `${base}/book/${company.slug}/sms-terms`,
    },
    brief,
    photos: [
      ...uploads.map((p) => ({
        id: p.id,
        url: abs(`/api/public/site-photos/${p.id}`),
        alt: p.alt ?? "",
        caption: p.caption ?? "",
        kind: p.kind,
        source: "upload" as const,
        takenAt: p.createdAt.toISOString(),
      })),
      // Job-photo captions are the tech's notes ("Smith, 123 Main St,
      // before") and the owner never reviews them for the site — alt only (F5).
      ...jobPhotos.map((p) => ({
        id: p.id,
        url: abs(`/api/public/site-photos/${p.id}`),
        alt: p.alt ?? "",
        caption: "",
        kind: p.type.toLowerCase(),
        source: "job" as const,
        takenAt: p.createdAt.toISOString(),
      })),
    ],
    website: {
      status: site.status,
      domain: site.domain,
      previewUrl: site.previewUrl,
      direction: site.direction,
    },
  };
}

/** The legal name the public may see: only with the owner's "show the legal name" switch on. Pure. */
export function publicLegalName(c: { legalName: string | null; showLegalNameOnDocs: boolean }): string | null {
  return c.showLegalNameOnDocs ? c.legalName : null;
}

// ─── Owner-side summary (Settings → Website) ─────────────────────────────────

export type WebsiteSummary = {
  status: WebsiteStatus;
  brief: WebsiteBrief;
  briefSubmittedAt: string | null;
  domain: string | null;
  previewUrl: string | null;
  direction: string | null;
  liveAt: string | null;
  gaps: BriefGap[];
  /** Company facts the site needs that Settings → Business info still lacks */
  companyGaps: BriefGap[];
  photos: { id: string; url: string; alt: string; caption: string; kind: string; source: "upload" | "job"; jobId?: string }[];
};

export async function loadWebsiteSummary(companyId: string): Promise<WebsiteSummary> {
  const [site, company, uploads, jobPhotos] = await Promise.all([
    prisma.website.findUnique({ where: { companyId } }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { phone: true, email: true, address: true, city: true, logoUrl: true, about: true },
    }),
    prisma.websitePhoto.findMany({
      where: { companyId },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      select: { id: true, alt: true, caption: true, kind: true },
    }),
    prisma.jobPhoto.findMany({
      where: { siteUse: true, job: { companyId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, alt: true, caption: true, type: true, jobId: true },
      take: 60,
    }),
  ]);
  const brief = sanitizeBrief(site?.brief);
  const companyGaps: BriefGap[] = [];
  if (!company?.phone) companyGaps.push({ key: "phone", label: "Business phone" });
  if (!company?.email) companyGaps.push({ key: "email", label: "Business email" });
  if (!company?.address || !company?.city) companyGaps.push({ key: "address", label: "Business address" });
  if (!company?.logoUrl) companyGaps.push({ key: "logo", label: "Your logo" });
  if (!company?.about) companyGaps.push({ key: "about", label: "About your business" });
  return {
    status: site?.status ?? "NOT_STARTED",
    brief,
    briefSubmittedAt: site?.briefSubmittedAt?.toISOString() ?? null,
    domain: site?.domain ?? null,
    previewUrl: site?.previewUrl ?? null,
    direction: site?.direction ?? null,
    liveAt: site?.liveAt?.toISOString() ?? null,
    gaps: briefGaps(brief, uploads.length + jobPhotos.length),
    companyGaps,
    photos: [
      ...uploads.map((p) => ({
        id: p.id,
        url: `/api/public/site-photos/${p.id}`,
        alt: p.alt ?? "",
        caption: p.caption ?? "",
        kind: p.kind,
        source: "upload" as const,
      })),
      ...jobPhotos.map((p) => ({
        id: p.id,
        url: `/api/public/site-photos/${p.id}`,
        alt: p.alt ?? "",
        caption: p.caption ?? "",
        kind: p.type.toLowerCase(),
        source: "job" as const,
        jobId: p.jobId,
      })),
    ],
  };
}

// ─── Rebuilds ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 15_000;
const pendingByCompany = new Map<string, { timer: ReturnType<typeof setTimeout>; reason: string }>();

/** Company columns the site actually renders — other Company writes never rebuild. */
export const SITE_COMPANY_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "legalName",
  "phone",
  "lineNumber",
  "email",
  "address",
  "city",
  "state",
  "zip",
  "website",
  "about",
  "industry",
  "logoUrl",
  "brandColor",
  "brandColorSecondary",
  "brandFont",
  "reviewLink",
  "businessHours",
  "timezone",
]);

/** Models whose writes mean the site data changed (lib/db.ts middleware). */
export const SITE_MODELS: ReadonlySet<string> = new Set([
  "Website",
  "WebsitePhoto",
  "JobPhoto",
  "WorkItem",
  "BookingType",
  "BookingTypeService",
]);

export function dispatchConfigured(): boolean {
  return Boolean(process.env.SITES_DISPATCH_TOKEN);
}

/**
 * GitHub answers these when SITES_DISPATCH_TOKEN is dead or cannot see the
 * repo: 401 (bad credentials), 403 (no `contents: write`), 404 (a
 * fine-grained token that was not granted the repo at all).
 */
const TOKEN_REJECTED_STATUSES = new Set([401, 403, 404]);
export const TOKEN_REJECTED_PREFIX = "GitHub rejected SITES_DISPATCH_TOKEN";

/** Is this row's last rebuild error the token being refused? (console banner) */
export function isTokenRejectedError(rebuildError: string | null | undefined): boolean {
  return Boolean(rebuildError && rebuildError.startsWith(TOKEN_REJECTED_PREFIX));
}

function dispatchUrl(): string {
  return process.env.SITES_DISPATCH_URL ?? "https://api.github.com/repos/slyf3ll0w/workbench-sites/dispatches";
}

/**
 * Debounced: a burst of edits (the Settings form saving several fields,
 * five photos flagged in a row) becomes one build. No-op for companies
 * without a site in a rebuildable state.
 */
export function scheduleSiteRebuild(companyId: string | null, reason: string): void {
  if (!companyId) return;
  const existing = pendingByCompany.get(companyId);
  if (existing) clearTimeout(existing.timer);
  pendingByCompany.set(companyId, {
    reason,
    timer: setTimeout(() => {
      const entry = pendingByCompany.get(companyId);
      pendingByCompany.delete(companyId);
      rebuildNow(companyId, entry?.reason ?? reason).catch((err) =>
        reportError("[website] debounced rebuild failed", { companyId, error: err })
      );
    }, DEBOUNCE_MS),
  });
}

export type RebuildResult = { ok: true; sent: boolean } | { ok: false; error: string };

/**
 * Send the dispatch for this company's site right now. `force` skips the
 * status check (the console's "Rebuild now" on a site still in the studio).
 */
export async function rebuildNow(companyId: string, reason: string, opts: { force?: boolean } = {}): Promise<RebuildResult> {
  const site = await prisma.website.findUnique({
    where: { companyId },
    select: { id: true, status: true, company: { select: { slug: true } } },
  });
  if (!site) return { ok: false, error: "No website row." };
  if (!opts.force && !REBUILDABLE.has(site.status)) return { ok: true, sent: false };

  const now = new Date();
  if (!dispatchConfigured()) {
    await prisma.website.update({
      where: { id: site.id },
      data: { rebuildQueuedAt: now, rebuildReason: reason, rebuildError: "SITES_DISPATCH_TOKEN is not set" },
    });
    return { ok: true, sent: false };
  }

  try {
    const res = await fetch(dispatchUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SITES_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "rebuild", client_payload: { slug: site.company.slug, reason } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok && res.status !== 204) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      const tokenRejected = TOKEN_REJECTED_STATUSES.has(res.status);
      const error = tokenRejected
        ? `${TOKEN_REJECTED_PREFIX} (${res.status}${text ? `: ${text}` : ""}). Re-mint the token on Railway.`
        : `GitHub answered ${res.status}${text ? `: ${text}` : ""}`;
      await prisma.website.update({
        where: { id: site.id },
        data: { rebuildQueuedAt: now, rebuildReason: reason, rebuildError: error },
      });
      if (tokenRejected) {
        // A dead or under-scoped token is configuration, not a code path
        // that broke: the row and the console banner carry it, and paging
        // Sentry on every edit until it is re-minted only buries real
        // issues (Sentry eccdb5ad, 2026-10-06).
        console.warn("[website] dispatch token rejected", { companyId, status: res.status, text });
      } else {
        reportError("[website] dispatch refused", { companyId, status: res.status, text });
      }
      return { ok: false, error };
    }
    await prisma.website.update({
      where: { id: site.id },
      data: { rebuildQueuedAt: now, rebuildSentAt: now, rebuildReason: reason, rebuildError: null },
    });
    return { ok: true, sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "dispatch failed";
    await prisma.website
      .update({ where: { id: site.id }, data: { rebuildQueuedAt: now, rebuildReason: reason, rebuildError: error } })
      .catch(() => undefined);
    reportError("[website] dispatch failed", { companyId, error: err });
    return { ok: false, error };
  }
}

/** Does a Company update touch something the site shows? (pure; lib/db.ts) */
export function companyWriteTouchesSite(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  for (const k of Object.keys(data as Record<string, unknown>)) if (SITE_COMPANY_FIELDS.has(k)) return true;
  return false;
}

/**
 * Does a Website update change what the site shows? (pure; lib/db.ts)
 * `rebuildNow` itself writes the row (rebuildQueuedAt / SentAt / Reason /
 * Error) — bookkeeping about the build, not site content. Treating those
 * writes as a change made every build schedule the next one 15 s later,
 * forever (audit 2026-10-06, F1). A write with no data (a delete) or with
 * any other field still counts.
 */
export function websiteWriteTouchesSite(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const keys = Object.keys(data as Record<string, unknown>);
  if (keys.length === 0) return true;
  return keys.some((k) => !k.startsWith("rebuild"));
}
