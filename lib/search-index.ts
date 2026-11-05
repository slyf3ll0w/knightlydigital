import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import sitemap from "@/app/sitemap";
import { inspectUrl, searchConsoleConfigured } from "@/lib/search-console";

/**
 * Is each page of the site in Google's index? Search Console answers one
 * URL at a time (the URL Inspection API, ~2,000 calls a day), so the hourly
 * cron (`searchIndex` step) inspects the sitemap's stalest pages a few at a
 * time and keeps the answer in SearchIndexStatus; the Traffic page reads
 * the table. Every page gets re-checked about every three days.
 */

export const INDEX_SWEEP_BATCH = 40;
const RECHECK_MS = 3 * 86_400_000;

export async function runSearchIndexSweep(now = new Date()): Promise<{ checked: number }> {
  if (!searchConsoleConfigured()) return { checked: 0 };
  const urls = sitemap().map((e) => e.url);
  const known = await prisma.searchIndexStatus.findMany({ where: { url: { in: urls } }, select: { url: true, checkedAt: true } });
  const checkedAt = new Map(known.map((k) => [k.url, k.checkedAt.getTime()]));
  const due = urls
    .filter((u) => (checkedAt.get(u) ?? 0) < now.getTime() - RECHECK_MS)
    .sort((a, b) => (checkedAt.get(a) ?? 0) - (checkedAt.get(b) ?? 0))
    .slice(0, INDEX_SWEEP_BATCH);
  let checked = 0;
  for (const url of due) {
    try {
      const r = await inspectUrl(url);
      await prisma.searchIndexStatus.upsert({
        where: { url },
        create: { url, ...r, checkedAt: now },
        update: { ...r, checkedAt: now },
      });
      checked++;
    } catch (e) {
      reportError("[search-index] inspect failed", e);
      break; // quota or auth: try again next hour rather than burn the batch
    }
  }
  // Pages that left the sitemap no longer matter.
  await prisma.searchIndexStatus.deleteMany({ where: { url: { notIn: urls } } }).catch(() => undefined);
  return { checked };
}

export type IndexRow = { url: string; path: string; verdict: string | null; coverageState: string | null; lastCrawlTime: Date | null; checkedAt: Date; googleCanonical: string | null };

export async function searchIndexRows(): Promise<IndexRow[]> {
  const rows = await prisma.searchIndexStatus.findMany({ orderBy: { url: "asc" } });
  return rows.map((r) => ({ url: r.url, path: pathFrom(r.url), verdict: r.verdict, coverageState: r.coverageState, lastCrawlTime: r.lastCrawlTime, checkedAt: r.checkedAt, googleCanonical: r.googleCanonical }));
}

function pathFrom(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
}

/** "Indexed", "Not indexed: Crawled - currently not indexed", or "Not checked yet". */
export function indexLabel(r: IndexRow | undefined): { text: string; ok: boolean | null } {
  if (!r) return { text: "Not checked yet", ok: null };
  if (r.verdict === "PASS") return { text: "Indexed", ok: true };
  return { text: r.coverageState ?? r.verdict ?? "Unknown", ok: false };
}
