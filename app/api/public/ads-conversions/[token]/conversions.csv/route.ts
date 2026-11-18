import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { adsConversionsCsv } from "@/lib/ads-conversions";
import { loadAdsConversions } from "@/lib/ads-conversions-server";

export const dynamic = "force-dynamic";

/**
 * The file Google Ads fetches on a schedule: one row per payment from a lead
 * that arrived on a Google ad click (lib/ads-conversions.ts). The address is
 * the key (Settings mints it; a new one kills the old). Google sends a user
 * name and password with the request; they are not checked.
 *
 * Holds click ids, amounts and times. No names, emails, phones or addresses.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 32) return new NextResponse("Not found.", { status: 404 });

  const company = await prisma.company.findUnique({
    where: { adsFeedToken: token },
    select: { id: true, suspendedAt: true },
  });
  if (!company || company.suspendedAt) return new NextResponse("Not found.", { status: 404 });

  const rl = await limit(`ads-feed:${company.id}`, 60, 3600000);
  if (!rl.ok) {
    return new NextResponse("Too many requests. Try again later.", { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  }

  const summary = await loadAdsConversions(company.id);
  await prisma.company.update({ where: { id: company.id }, data: { adsFeedFetchedAt: new Date() } }).catch(() => {});

  return new NextResponse(adsConversionsCsv(summary.rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="conversions.csv"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
