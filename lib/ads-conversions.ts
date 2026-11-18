/**
 * Paid jobs reported back to Google Ads (2026-11-18).
 *
 * A website lead that arrived from a Google ad carries the ad's click id
 * (`Contact.leadArrival.gclid`, see lib/lead-source.ts). When that lead pays,
 * Google can be told "this click became $X", so its bidding chases paying
 * work and not form fills. Google calls this an offline conversion import.
 *
 * How it gets there: the company turns on a private file address; Google Ads
 * fetches it on a schedule the owner sets up once (Data Manager → HTTPS, or
 * the older Conversions → Uploads → Schedules). No Google API approval and
 * no sign-in to Google from WorkBench. The file is always "every payment
 * Google will still accept": Google ignores a row it has already counted
 * (same click, name and time), so nothing has to remember what was sent.
 *
 * Pure (no Prisma, no window): the public file route, the setup page, the
 * Atlas tool and the unit test share these rules.
 * Plan: docs/plans/ads-conversions-2026-11-18.md
 * Test: npx tsx scripts/test-ads-conversions.ts
 */

/** The conversion action's name. The one made in Google Ads must match it exactly. */
export const ADS_CONVERSION_NAME = "WorkBench paid job";

/** Google keeps a click id for 90 days; a payment reported after that is refused. */
export const ADS_CLICK_WINDOW_DAYS = 90;

/** Google wants a user name and password with the address. The address is the key; these are accepted as typed. */
export const ADS_FEED_USERNAME = "workbench";
export const ADS_FEED_PASSWORD = "workbench";

/** The header row. Data Manager matches these to its own fields; the older upload page reads them as is. */
export const ADS_CSV_HEADERS = ["Google Click ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency"] as const;

const DAY_MS = 86400000;

/** One payment, with what its client's arrival said. */
export type AdsPayment = {
  id: string;
  amount: number;
  paidAt: Date;
  contactId: string;
  /** When the client was first saved (the click time when the arrival has none). */
  contactCreatedAt: Date;
  /** `Contact.leadArrival` as stored. */
  arrival: unknown;
};

export type AdsConversionRow = {
  paymentId: string;
  contactId: string;
  gclid: string;
  /** "yyyy-MM-dd HH:mm:ss+0000" (UTC) */
  time: string;
  value: number;
};

export type AdsConversionSummary = {
  rows: AdsConversionRow[];
  /** Dollars in `rows`. */
  value: number;
  /** Clients behind `rows`. */
  clients: number;
  /** Payments left out because the ad click is older than Google accepts. */
  tooLate: number;
  /** Payments left out because the click came from an iPhone app or browser that hides the click id (only gbraid / wbraid was saved). */
  noClickId: number;
};

function arrivalOf(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** A click id safe to put in the file: Google's own alphabet only, so a posted value can never break a row or start a formula. */
export function cleanGclid(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return /^[A-Za-z0-9_-]{10,300}$/.test(s) ? s : "";
}

/** True when the arrival shows a Google ad click of any kind. */
export function hasGoogleAdClick(raw: unknown): boolean {
  const a = arrivalOf(raw);
  if (!a) return false;
  return [a.gclid, a.gbraid, a.wbraid].some((v) => typeof v === "string" && v.trim() !== "");
}

/** When the ad was clicked: the arrival's own time, else when the lead was saved. */
export function clickTime(raw: unknown, contactCreatedAt: Date): Date {
  const a = arrivalOf(raw);
  const at = a && typeof a.at === "number" && Number.isFinite(a.at) && a.at > 0 ? a.at : null;
  // A browser clock can be wrong: never later than the lead itself.
  if (at !== null && at <= contactCreatedAt.getTime()) return new Date(at);
  return contactCreatedAt;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-18 14:03:22+0000" */
export function conversionTime(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`;
}

/**
 * The payments Google will accept right now, oldest first. Left out: money
 * that came back (amount 0 or less), clients with no Google ad click, a
 * click older than 90 days, a payment dated before the click, and clicks
 * with no usable click id.
 */
export function buildAdsConversions(payments: AdsPayment[], now: Date): AdsConversionSummary {
  const rows: AdsConversionRow[] = [];
  let tooLate = 0;
  let noClickId = 0;
  for (const p of payments) {
    if (!Number.isFinite(p.amount) || p.amount <= 0) continue;
    if (!hasGoogleAdClick(p.arrival)) continue;
    const clicked = clickTime(p.arrival, p.contactCreatedAt);
    if (p.paidAt.getTime() < clicked.getTime()) continue;
    if (p.paidAt.getTime() > now.getTime()) continue;
    if (now.getTime() - clicked.getTime() > ADS_CLICK_WINDOW_DAYS * DAY_MS) {
      tooLate += 1;
      continue;
    }
    const gclid = cleanGclid(arrivalOf(p.arrival)?.gclid);
    if (!gclid) {
      noClickId += 1;
      continue;
    }
    rows.push({ paymentId: p.id, contactId: p.contactId, gclid, time: conversionTime(p.paidAt), value: Math.round(p.amount * 100) / 100 });
  }
  rows.sort((a, b) => a.time.localeCompare(b.time) || a.paymentId.localeCompare(b.paymentId));
  // Two payments for one click in the same second would read as one row to Google: fold them.
  const folded: AdsConversionRow[] = [];
  for (const r of rows) {
    const last = folded[folded.length - 1];
    if (last && last.gclid === r.gclid && last.time === r.time) last.value = Math.round((last.value + r.value) * 100) / 100;
    else folded.push({ ...r });
  }
  return {
    rows: folded,
    value: Math.round(folded.reduce((s, r) => s + r.value, 0) * 100) / 100,
    clients: new Set(folded.map((r) => r.contactId)).size,
    tooLate,
    noClickId,
  };
}

/** The file Google fetches: a header row, then one row per payment. Always has the header, even with nothing to report. */
export function adsConversionsCsv(rows: AdsConversionRow[], currency = "USD"): string {
  const lines = [ADS_CSV_HEADERS.join(",")];
  for (const r of rows) lines.push([r.gclid, ADS_CONVERSION_NAME, r.time, r.value.toFixed(2), currency].join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The private address of a company's file. Ends in .csv: Google refuses an address that does not. */
export function adsFeedUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/api/public/ads-conversions/${token}/conversions.csv`;
}
