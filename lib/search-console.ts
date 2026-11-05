import { createSign } from "node:crypto";
import { reportError } from "@/lib/report-error";

/**
 * Google Search Console, read back for the console's Traffic page: search
 * clicks, impressions and positions per page and per query, the sitemap's
 * status, and (lib/search-index.ts) whether each page is indexed.
 *
 * Auth is a Google service account added to the Search Console property as
 * a user. Env: GSC_SERVICE_ACCOUNT_JSON (the downloaded key file, as JSON
 * or base64), GSC_SITE_URL (the property, default sc-domain:workbenchfsm.com).
 * Responses are cached ten minutes in memory. Search data runs about two
 * days behind; dataState "all" includes what Google has so far.
 */

export const GSC_SITE_URL = process.env.GSC_SITE_URL?.trim() || "sc-domain:workbenchfsm.com";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const CACHE_MS = 10 * 60_000;

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text) as ServiceAccount;
    return j.client_email && j.private_key ? j : null;
  } catch {
    return null;
  }
}

export function searchConsoleConfigured(): boolean {
  return serviceAccount() !== null;
}

let token: { value: string; exp: number } | null = null;

/** Service-account JWT → OAuth access token (RFC 7523), cached until it expires. */
async function accessToken(): Promise<string> {
  if (token && token.exp - 60_000 > Date.now()) return token.value;
  const sa = serviceAccount();
  if (!sa) throw new Error("Search Console: GSC_SERVICE_ACCOUNT_JSON is not set");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(12_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Search Console token: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim());
  token = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function gsc(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(`Search Console ${res.status}: ${json.error?.message ?? ""}`.trim());
  return json;
}

const site = () => encodeURIComponent(GSC_SITE_URL);
const cache = new Map<string, { at: number; value: unknown }>();
async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export type GscRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Search analytics grouped by one dimension over the last `days` days. */
export async function searchAnalytics(days: number, dimension: "page" | "query" | "date" | "country" | "device", rowLimit = 250): Promise<GscRow[]> {
  return memo(`sa:${days}:${dimension}:${rowLimit}`, async () => {
    const json = (await gsc(`https://www.googleapis.com/webmasters/v3/sites/${site()}/searchAnalytics/query`, {
      method: "POST",
      body: JSON.stringify({ startDate: isoDaysAgo(days), endDate: isoDaysAgo(0), dimensions: [dimension], rowLimit, dataState: "all", type: "web" }),
    })) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
    return (json.rows ?? []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  });
}

export type GscSitemap = { path: string; lastSubmitted: string | null; lastDownloaded: string | null; submitted: number; indexed: number; errors: number; warnings: number; isPending: boolean };

/** The sitemaps Google knows for the property, with their last fetch and counts. */
export async function sitemapsStatus(): Promise<GscSitemap[]> {
  return memo("sitemaps", async () => {
    const json = (await gsc(`https://www.googleapis.com/webmasters/v3/sites/${site()}/sitemaps`)) as {
      sitemap?: { path: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { submitted?: string; indexed?: string }[] }[];
    };
    return (json.sitemap ?? []).map((s) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted ?? null,
      lastDownloaded: s.lastDownloaded ?? null,
      submitted: (s.contents ?? []).reduce((n, c) => n + Number(c.submitted ?? 0), 0),
      indexed: (s.contents ?? []).reduce((n, c) => n + Number(c.indexed ?? 0), 0),
      errors: Number(s.errors ?? 0),
      warnings: Number(s.warnings ?? 0),
      isPending: Boolean(s.isPending),
    }));
  });
}

export type UrlInspection = {
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  googleCanonical: string | null;
  lastCrawlTime: Date | null;
};

/** URL Inspection: what Google's index holds for one page (quota ~2,000 a day per property). Not cached. */
export async function inspectUrl(url: string): Promise<UrlInspection> {
  const json = (await gsc("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    body: JSON.stringify({ inspectionUrl: url, siteUrl: GSC_SITE_URL, languageCode: "en-US" }),
  })) as {
    inspectionResult?: {
      indexStatusResult?: { verdict?: string; coverageState?: string; indexingState?: string; robotsTxtState?: string; pageFetchState?: string; googleCanonical?: string; lastCrawlTime?: string };
    };
  };
  const r = json.inspectionResult?.indexStatusResult ?? {};
  return {
    verdict: r.verdict ?? null,
    coverageState: r.coverageState ?? null,
    indexingState: r.indexingState ?? null,
    robotsTxtState: r.robotsTxtState ?? null,
    pageFetchState: r.pageFetchState ?? null,
    googleCanonical: r.googleCanonical ?? null,
    lastCrawlTime: r.lastCrawlTime ? new Date(r.lastCrawlTime) : null,
  };
}

/** Safe wrapper for the page: null when unconfigured or Google refuses (logged once per failure). */
export async function searchConsoleSnapshot(days: number): Promise<{ pages: GscRow[]; queries: GscRow[]; dates: GscRow[]; sitemaps: GscSitemap[] } | null> {
  if (!searchConsoleConfigured()) return null;
  try {
    const [pages, queries, dates, sitemaps] = await Promise.all([searchAnalytics(days, "page", 500), searchAnalytics(days, "query", 100), searchAnalytics(days, "date", 100), sitemapsStatus()]);
    return { pages, queries, dates, sitemaps };
  } catch (e) {
    reportError("[search-console] read failed", e);
    return null;
  }
}

/** "https://workbenchfsm.com/trades/hvac" → "/trades/hvac", for joining with our own path-keyed rows. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
}
