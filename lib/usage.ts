/**
 * Platform usage metering — one CompanyUsageDaily row per company per UTC
 * day, upserted with atomic increments. Every recorder here is fire-and-
 * forget: metering must never fail (or slow down) the user-facing send it
 * rides along with, so callers don't await these and all errors end at
 * console.error.
 *
 * companyId is nullable everywhere — sends with no tenant (password resets,
 * portal logins) land on the "platform" sentinel row so the totals still add
 * up to the real bill.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/db";

/** Sentinel companyId for usage that belongs to no tenant. */
export const PLATFORM_COMPANY_ID = "platform";

// Ambient tenant for metering — lets a route attribute a whole call tree
// (e.g. the setup wizard's nested lookup/vision calls) without threading
// companyId through every internal function signature.
const usageCompany = new AsyncLocalStorage<string>();

/** Run fn with companyId as the default metering tenant for everything inside. */
export function withUsageCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return usageCompany.run(companyId, fn);
}

/** The ambient metering tenant, when inside withUsageCompany. */
export function currentUsageCompany(): string | undefined {
  return usageCompany.getStore();
}

/** Today's UTC date key, e.g. "2026-07-20". */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type Counters = Partial<{
  aiCalls: number;
  aiTokensIn: number;
  aiTokensOut: number;
  aiTokensCached: number;
  emailsSent: number;
  smsSent: number;
  smsSegments: number;
}>;

async function bump(companyId: string | null | undefined, counters: Counters) {
  const id = companyId || PLATFORM_COMPANY_ID;
  const day = usageDay();
  const increments = Object.fromEntries(
    Object.entries(counters)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .map(([k, v]) => [k, { increment: v }])
  );
  if (Object.keys(increments).length === 0) return;
  try {
    await prisma.companyUsageDaily.upsert({
      where: { companyId_day: { companyId: id, day } },
      create: { companyId: id, day, ...counters },
      update: increments,
    });
  } catch (err) {
    // Two firsts-of-the-day racing can both take the create branch; the loser
    // hits the unique constraint — retry once as a pure update.
    try {
      await prisma.companyUsageDaily.update({
        where: { companyId_day: { companyId: id, day } },
        data: increments,
      });
    } catch {
      console.error("[usage] failed to record", id, counters, err);
    }
  }
}

/** Gemini token usage for one API call (parsed from usageMetadata). */
export function recordAiUsage(
  companyId: string | null | undefined,
  usage: { tokensIn?: number; tokensOut?: number; tokensCached?: number }
): void {
  void bump(companyId, {
    aiCalls: 1,
    aiTokensIn: usage.tokensIn ?? 0,
    aiTokensOut: usage.tokensOut ?? 0,
    aiTokensCached: usage.tokensCached ?? 0,
  });
}

/** One successful Resend send. */
export function recordEmailSent(companyId: string | null | undefined): void {
  void bump(companyId, { emailsSent: 1 });
}

/** One successful Telnyx send; Telnyx bills per segment. */
export function recordSmsSent(companyId: string | null | undefined, segments: number): void {
  void bump(companyId, { smsSent: 1, smsSegments: Math.max(1, segments) });
}

/**
 * Nightly per-company storage snapshot — all binary data lives as Bytes
 * columns in Postgres (Company.logoData, User.avatarData, JobPhoto.data), so
 * a byte sum per tenant IS the storage footprint. Written onto today's usage
 * row as a point-in-time level (overwritten, never incremented). Called from
 * the daily cron.
 */
export async function rollupStorageSnapshots(): Promise<number> {
  const day = usageDay();
  const rows = await prisma.$queryRaw<{ companyId: string; bytes: bigint }[]>`
    SELECT c.id AS "companyId",
           COALESCE(octet_length(c."logoData"), 0)::bigint
         + COALESCE(u.bytes, 0)::bigint
         + COALESCE(p.bytes, 0)::bigint AS bytes
    FROM "Company" c
    LEFT JOIN (
      SELECT "companyId", SUM(octet_length("avatarData")) AS bytes
      FROM "User" WHERE "avatarData" IS NOT NULL GROUP BY "companyId"
    ) u ON u."companyId" = c.id
    LEFT JOIN (
      SELECT j."companyId", SUM(octet_length(jp."data")) AS bytes
      FROM "JobPhoto" jp JOIN "Job" j ON j.id = jp."jobId"
      WHERE jp."data" IS NOT NULL GROUP BY j."companyId"
    ) p ON p."companyId" = c.id
  `;
  for (const r of rows) {
    await prisma.companyUsageDaily.upsert({
      where: { companyId_day: { companyId: r.companyId, day } },
      create: { companyId: r.companyId, day, storageBytes: r.bytes },
      update: { storageBytes: r.bytes },
    });
  }
  return rows.length;
}

/**
 * SMS segment count for a message body. GSM-7 messages pack 160 chars (153
 * when concatenated); any non-GSM char flips the whole message to UCS-2 at
 * 70/67. Close enough for cost tracking — Telnyx's own count is authoritative
 * but arrives per-message on the API response we don't parse.
 */
export function smsSegmentCount(text: string): number {
  // Rough GSM-7 test: ASCII plus the common GSM extras.
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§äöñüà€]*$/.test(text);
  const len = text.length;
  if (gsm) return len <= 160 ? 1 : Math.ceil(len / 153);
  return len <= 70 ? 1 : Math.ceil(len / 67);
}
