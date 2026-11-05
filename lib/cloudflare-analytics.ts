import { reportError } from "@/lib/report-error";

/**
 * Cloudflare Web Analytics, read back for the console's Traffic page
 * (/superadmin/traffic). The beacon on the marketing site
 * (NEXT_PUBLIC_CF_BEACON_TOKEN) records page loads at Cloudflare; this
 * module pulls the totals, top pages, referrers, countries, devices and
 * the per-day series through the GraphQL Analytics API.
 *
 * Env: CLOUDFLARE_API_TOKEN (an API token with "Account Analytics: Read"
 * and "Account Settings: Read"), CLOUDFLARE_ACCOUNT_ID. The site is found
 * by matching the beacon token against the account's Web Analytics sites
 * (or set CLOUDFLARE_WEB_ANALYTICS_SITE_TAG directly). Everything is cached
 * ten minutes in memory.
 *
 * Scope: Cloudflare sees the whole domain when the zone auto-injects the
 * beacon (client booking pages, pay links, the portal, the app). The
 * Traffic page is about the marketing site, so the query excludes those
 * paths (`requestPath_notlike`), and `isMarketingPath` applies the same
 * rule to anything path-keyed on the page. If Cloudflare ever rejects the
 * path filter the query falls back to the whole domain and says so
 * (`scoped: false`). The numbers are sampled estimates, as in Cloudflare's
 * own dashboard.
 */

const API = "https://api.cloudflare.com/client/v4";
const CACHE_MS = 10 * 60_000;

/** Path prefixes that are the app or a client-facing page, not the marketing site. */
export const NON_MARKETING_PREFIXES = [
  "/app",
  "/api/",
  "/superadmin",
  "/book/",
  "/embed/",
  "/pay/",
  "/quote/",
  "/hub/",
  "/portal/",
  "/message/",
  "/contract/",
  "/invite",
  "/_next/",
];

export function isMarketingPath(path: string): boolean {
  const p = path.split("?")[0];
  return !NON_MARKETING_PREFIXES.some(
    (prefix) => p === prefix.replace(/\/$/, "") || p.startsWith(prefix),
  );
}

/** Referrers that are the site itself or sign-in plumbing, not a source of visitors. */
const IGNORED_REFERERS =
  /(^|\.)workbenchfsm\.com$|^accounts\.google\.com$|^appleid\.apple\.com$|^127\.0\.0\.1$|^localhost(:\d+)?$/;

export type CfRow = { key: string; pageViews: number; visits: number };
export type CfAnalytics = {
  days: number;
  /** true = marketing pages only; false = Cloudflare refused the path filter, whole domain shown. */
  scoped: boolean;
  pageViews: number;
  visits: number;
  byPath: CfRow[];
  byReferer: CfRow[];
  byCountry: CfRow[];
  byDevice: CfRow[];
  byDate: CfRow[];
};

export function cloudflareAnalyticsConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID,
  );
}

const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? (hit.value as T) : null;
}

async function cfFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(12_000),
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    errors?: { message: string }[];
    result?: unknown;
    data?: unknown;
  } | null;
  if (
    !res.ok ||
    json?.success === false ||
    (json?.errors && json.errors.length)
  ) {
    throw new Error(
      `Cloudflare ${path}: ${res.status} ${json?.errors?.map((e) => e.message).join("; ") ?? ""}`.trim(),
    );
  }
  return json;
}

/** The Web Analytics site this deployment's beacon reports to. */
export async function cloudflareSiteTag(): Promise<string | null> {
  const fixed = process.env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG?.trim();
  if (fixed) return fixed;
  const hit = cached<string | null>("siteTag");
  if (hit !== null) return hit;
  const beacon = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN?.trim();
  const json = (await cfFetch(
    `/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/rum/site_info/list?per_page=50`,
  )) as {
    result?: {
      site_tag: string;
      site_token: string;
      ruleset?: { zone_name?: string };
    }[];
  };
  const sites = json.result ?? [];
  const site =
    (beacon && sites.find((s) => s.site_token === beacon)) ||
    sites.find((s) => s.ruleset?.zone_name === "workbenchfsm.com") ||
    sites[0];
  const tag = site?.site_tag ?? null;
  cache.set("siteTag", { at: Date.now(), value: tag });
  return tag;
}

type Group = {
  count: number;
  sum: { visits: number };
  dimensions: Record<string, string>;
};
type Account = {
  total?: Group[];
  paths?: Group[];
  referers?: Group[];
  countries?: Group[];
  devices?: Group[];
  dates?: Group[];
};

function rows(groups: Group[] | undefined, dim: string): CfRow[] {
  return (groups ?? [])
    .map((g) => ({
      key: g.dimensions[dim] ?? "",
      pageViews: g.count,
      visits: g.sum?.visits ?? 0,
    }))
    .filter((r) => r.pageViews > 0 || r.visits > 0);
}

async function queryAccount(
  siteTag: string,
  start: Date,
  end: Date,
  scoped: boolean,
): Promise<Account | null> {
  const pathClauses = scoped
    ? NON_MARKETING_PREFIXES.map(
        (p) => `{ requestPath_notlike: "${p}%" }`,
      ).join(", ")
    : "";
  const filter = `{ AND: [{ datetime_geq: "${start.toISOString()}", datetime_leq: "${end.toISOString()}" }, { siteTag: "${siteTag}" }${pathClauses ? ", " + pathClauses : ""}] }`;
  const group = (
    alias: string,
    dim: string,
    limit: number,
    order = "count_DESC",
  ) =>
    `${alias}: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: ${limit}, orderBy: [${order}]) { count sum { visits } dimensions { ${dim} } }`;
  const query = `{ viewer { accounts(filter: { accountTag: "${process.env.CLOUDFLARE_ACCOUNT_ID}" }) {
    total: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: 1) { count sum { visits } }
    ${group("paths", "requestPath", 150)}
    ${group("referers", "refererHost", 40)}
    ${group("countries", "countryName", 20)}
    ${group("devices", "deviceType", 5)}
    ${group("dates", "date", 100, "date_ASC")}
  } } }`;
  const json = (await cfFetch("/graphql", {
    method: "POST",
    body: JSON.stringify({ query }),
  })) as { data?: { viewer?: { accounts?: Account[] } } };
  return json.data?.viewer?.accounts?.[0] ?? null;
}

/** Totals + breakdowns for the last `days` days, or null when unconfigured or Cloudflare refuses. */
export async function cloudflareWebAnalytics(
  days: number,
): Promise<CfAnalytics | null> {
  if (!cloudflareAnalyticsConfigured()) return null;
  const key = `analytics:${days}`;
  const hit = cached<CfAnalytics>(key);
  if (hit) return hit;
  try {
    const siteTag = await cloudflareSiteTag();
    if (!siteTag) return null;
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    let scoped = true;
    let acct: Account | null;
    try {
      acct = await queryAccount(siteTag, start, end, true);
    } catch (e) {
      // The path filter is the one part of the query built on an assumption
      // about Cloudflare's filter grammar; if it is refused, show the whole
      // domain rather than nothing, and say so on the page.
      reportError(
        "[cloudflare-analytics] scoped query refused, falling back to the whole domain",
        e,
      );
      scoped = false;
      acct = await queryAccount(siteTag, start, end, false);
    }
    if (!acct) return null;
    const total = acct.total?.[0];
    // Belt and braces: the page-level rows are filtered here too, so a
    // fallback query still lists marketing pages only.
    const byPath = rows(acct.paths, "requestPath")
      .map((r) => ({
        ...r,
        key: r.key.split("?")[0].replace(/\/$/, "") || "/",
      }))
      .filter((r) => isMarketingPath(r.key));
    const value: CfAnalytics = {
      days,
      scoped,
      pageViews: scoped
        ? (total?.count ?? 0)
        : byPath.reduce((s, r) => s + r.pageViews, 0),
      visits: scoped
        ? (total?.sum?.visits ?? 0)
        : byPath.reduce((s, r) => s + r.visits, 0),
      byPath,
      byReferer: rows(acct.referers, "refererHost").filter(
        (r) => r.key && !IGNORED_REFERERS.test(r.key),
      ),
      byCountry: rows(acct.countries, "countryName"),
      byDevice: rows(acct.devices, "deviceType"),
      byDate: rows(acct.dates, "date"),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    reportError("[cloudflare-analytics] read failed", e);
    return null;
  }
}
