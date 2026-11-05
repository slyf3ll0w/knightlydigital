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
 * ten minutes in memory; the data itself is sampled by Cloudflare, so the
 * numbers are estimates, as they are in Cloudflare's own dashboard.
 */

const API = "https://api.cloudflare.com/client/v4";
const CACHE_MS = 10 * 60_000;

export type CfRow = { key: string; pageViews: number; visits: number };
export type CfAnalytics = {
  days: number;
  pageViews: number;
  visits: number;
  byPath: CfRow[];
  byReferer: CfRow[];
  byCountry: CfRow[];
  byDevice: CfRow[];
  byDate: CfRow[];
};

export function cloudflareAnalyticsConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
}

const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string): T | null {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? (hit.value as T) : null;
}

async function cfFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(12_000),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message: string }[]; result?: unknown; data?: unknown } | null;
  if (!res.ok || json?.success === false || (json?.errors && json.errors.length)) {
    throw new Error(`Cloudflare ${path}: ${res.status} ${json?.errors?.map((e) => e.message).join("; ") ?? ""}`.trim());
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
  const json = (await cfFetch(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/rum/site_info/list?per_page=50`)) as {
    result?: { site_tag: string; site_token: string; ruleset?: { zone_name?: string } }[];
  };
  const sites = json.result ?? [];
  const site = (beacon && sites.find((s) => s.site_token === beacon)) || sites.find((s) => s.ruleset?.zone_name === "workbenchfsm.com") || sites[0];
  const tag = site?.site_tag ?? null;
  cache.set("siteTag", { at: Date.now(), value: tag });
  return tag;
}

type Group = { count: number; sum: { visits: number }; dimensions: Record<string, string> };

function rows(groups: Group[] | undefined, dim: string): CfRow[] {
  return (groups ?? []).map((g) => ({ key: g.dimensions[dim] ?? "", pageViews: g.count, visits: g.sum?.visits ?? 0 }));
}

/** Totals + breakdowns for the last `days` days, or null when unconfigured or Cloudflare refuses. */
export async function cloudflareWebAnalytics(days: number): Promise<CfAnalytics | null> {
  if (!cloudflareAnalyticsConfigured()) return null;
  const key = `analytics:${days}`;
  const hit = cached<CfAnalytics>(key);
  if (hit) return hit;
  try {
    const siteTag = await cloudflareSiteTag();
    if (!siteTag) return null;
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const filter = `{ AND: [{ datetime_geq: "${start.toISOString()}", datetime_leq: "${end.toISOString()}" }, { siteTag: "${siteTag}" }] }`;
    const group = (alias: string, dim: string, limit: number, order = "count_DESC") =>
      `${alias}: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: ${limit}, orderBy: [${order}]) { count sum { visits } dimensions { ${dim} } }`;
    const query = `{ viewer { accounts(filter: { accountTag: "${process.env.CLOUDFLARE_ACCOUNT_ID}" }) {
      total: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: 1) { count sum { visits } }
      ${group("paths", "requestPath", 100)}
      ${group("referers", "refererHost", 30)}
      ${group("countries", "countryName", 20)}
      ${group("devices", "deviceType", 5)}
      ${group("dates", "date", 100, "date_ASC")}
    } } }`;
    const json = (await cfFetch("/graphql", { method: "POST", body: JSON.stringify({ query }) })) as {
      data?: { viewer?: { accounts?: { total?: Group[]; paths?: Group[]; referers?: Group[]; countries?: Group[]; devices?: Group[]; dates?: Group[] }[] } };
    };
    const acct = json.data?.viewer?.accounts?.[0];
    if (!acct) return null;
    const total = acct.total?.[0];
    const value: CfAnalytics = {
      days,
      pageViews: total?.count ?? 0,
      visits: total?.sum?.visits ?? 0,
      byPath: rows(acct.paths, "requestPath"),
      byReferer: rows(acct.referers, "refererHost").filter((r) => r.key && !r.key.endsWith("workbenchfsm.com")),
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
