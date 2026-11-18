/**
 * Paid jobs reported back to Google Ads: the reads behind the file Google
 * fetches, the setup page and the Atlas tool. Rules: lib/ads-conversions.ts.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  ADS_CLICK_WINDOW_DAYS,
  ADS_CONVERSION_NAME,
  ADS_FEED_PASSWORD,
  ADS_FEED_USERNAME,
  adsFeedUrl,
  buildAdsConversions,
  hasGoogleAdClick,
  type AdsConversionSummary,
  type AdsPayment,
} from "./ads-conversions";

/** Rows read for one file or one status; far above what 90 days of one company's ad leads pay. */
const READ_CAP = 5000;

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");
}

/** Every payment of the last 90 days from a client who arrived through a website form, reduced to what Google accepts. */
export async function loadAdsConversions(companyId: string, now = new Date()): Promise<AdsConversionSummary> {
  const since = new Date(now.getTime() - ADS_CLICK_WINDOW_DAYS * 86400000);
  const payments = await prisma.payment.findMany({
    where: {
      companyId,
      paidAt: { gte: since },
      amount: { gt: 0 },
      invoice: { contact: { leadArrival: { not: Prisma.AnyNull } } },
    },
    orderBy: { paidAt: "desc" },
    take: READ_CAP,
    select: {
      id: true,
      amount: true,
      paidAt: true,
      invoice: { select: { contact: { select: { id: true, createdAt: true, leadArrival: true } } } },
    },
  });
  const rows: AdsPayment[] = [];
  for (const p of payments) {
    const c = p.invoice?.contact;
    if (!c) continue;
    rows.push({ id: p.id, amount: Number(p.amount), paidAt: p.paidAt, contactId: c.id, contactCreatedAt: c.createdAt, arrival: c.leadArrival });
  }
  return buildAdsConversions(rows, now);
}

export type AdsFeedStatus = {
  enabled: boolean;
  /** The private file address; null when off. */
  url: string | null;
  /** Last time anything fetched the file (ISO); null when never. */
  fetchedAt: string | null;
  conversionName: string;
  username: string;
  password: string;
  /** Leads of the last 90 days that arrived from a Google ad. */
  adLeads: number;
  /** What the file holds right now. */
  payments: number;
  value: number;
  clients: number;
  tooLate: number;
  noClickId: number;
};

/** Everything the setup page and the Atlas tool show. Works with the file off: the numbers say what turning it on would report. */
export async function loadAdsFeedStatus(companyId: string, now = new Date()): Promise<AdsFeedStatus> {
  const since = new Date(now.getTime() - ADS_CLICK_WINDOW_DAYS * 86400000);
  const [company, summary, arrivals] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { adsFeedToken: true, adsFeedFetchedAt: true } }),
    loadAdsConversions(companyId, now),
    prisma.contact.findMany({
      where: { companyId, kind: "CLIENT", placeholder: false, createdAt: { gte: since }, leadArrival: { not: Prisma.AnyNull } },
      orderBy: { createdAt: "desc" },
      take: READ_CAP,
      select: { leadArrival: true },
    }),
  ]);
  const token = company?.adsFeedToken ?? null;
  return {
    enabled: !!token,
    url: token ? adsFeedUrl(baseUrl(), token) : null,
    fetchedAt: token && company?.adsFeedFetchedAt ? company.adsFeedFetchedAt.toISOString() : null,
    conversionName: ADS_CONVERSION_NAME,
    username: ADS_FEED_USERNAME,
    password: ADS_FEED_PASSWORD,
    adLeads: arrivals.filter((c) => hasGoogleAdClick(c.leadArrival)).length,
    payments: summary.rows.length,
    value: summary.value,
    clients: summary.clients,
    tooLate: summary.tooLate,
    noClickId: summary.noClickId,
  };
}
