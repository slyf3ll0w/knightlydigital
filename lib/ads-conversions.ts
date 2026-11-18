/**
 * Paid jobs reported back to Google Ads (2026-11-18).
 *
 * A website lead that arrived from a Google ad carries the ad's click id
 * (`Contact.leadArrival.gclid`, see lib/lead-source.ts). When that lead pays,
 * Google can be told "this click became $X", so its bidding chases paying
 * work and not form fills. Google calls this an offline conversion import.
 *
 * How it gets there: the company turns on a private file address; Google Ads
 * fetches it on a schedule the owner sets up once (a conversion action
 * whose data source is HTTPS, in Google's Data Manager). No Google API approval and
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

/**
 * The header row. Plain lower-case names with no spaces: the owner matches
 * each to Google's field on the Map fields step (the setup page lists the
 * pairs, ADS_FIELD_MAP below).
 */
export const ADS_CSV_HEADERS = ["gclid", "conversion_name", "conversion_time", "conversion_value", "currency"] as const;

/** Google's field on its Map fields step → the column in our file. Shown on the setup page and in the Help guide. */
export const ADS_FIELD_MAP: { google: string; column: (typeof ADS_CSV_HEADERS)[number]; note?: string }[] = [
  { google: "Google Click ID (GCLID)", column: "gclid" },
  { google: "Conversion date and time", column: "conversion_time" },
  { google: "Conversion value", column: "conversion_value" },
  { google: "Currency", column: "currency", note: "if Google asks for it" },
  { google: "Conversion action", column: "conversion_name", note: "if Google asks for it" },
];

/**
 * Google cannot finish its setup against a file with no rows: with only a
 * header its Select data step never lets the owner press Next (David,
 * Steadfast, 2026-11-18). So while a company has nothing to report yet, the
 * owner can put ONE sample row in the file for this long. Its click ID is
 * not a real one, so Google reports that row as unmatched and counts nothing.
 */
export const ADS_SAMPLE_HOURS = 2;

/**
 * The message an owner pastes into Google Ads' own assistant (Advisor) so it
 * creates the conversion action for them. Tested on Steadfast's account
 * 2026-11-18: Advisor created the action (type Upload clicks, Converted
 * lead, many per click) and could NOT connect the file, which stays by hand.
 * Under 2,000 characters: Advisor refuses a longer message.
 */
export const ADS_ADVISOR_PROMPT = [
  "Create a conversion action in this Google Ads account for importing offline conversions from clicks.",
  `Name: ${ADS_CONVERSION_NAME}`,
  "Type: upload clicks (import from clicks)",
  "Goal: Converted lead",
  "Count: every conversion (many per click)",
  "Value: use a different value for each conversion. Do not always use a default value.",
  "Status: enabled",
  "Also check that auto-tagging is on for this account, and turn it on if it is off.",
  "Do not change my campaigns, budgets, bidding or any other conversion action.",
  "When you are done, tell me what you created.",
].join("\n");
export const ADS_SAMPLE_GCLID = "SAMPLE_ROW_NOT_A_REAL_CLICK";

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
  /** "2026-11-18T14:03:22Z" (UTC) */
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

/** "2026-11-18T14:03:22Z": the form Google's own Data Manager examples use, time zone included. */
export function conversionTime(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** True while the sample row should be in the file: asked for, not expired, and nothing real to report. */
export function sampleRowActive(sampleUntil: Date | null | undefined, realRows: number, now: Date): boolean {
  return realRows === 0 && !!sampleUntil && sampleUntil.getTime() > now.getTime();
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

/**
 * The file Google fetches: a header row, then one row per payment. Always
 * has the header. `sampleAt` adds the one sample row, and only when there
 * are no real rows (a real file never carries it).
 */
export function adsConversionsCsv(rows: AdsConversionRow[], opts: { currency?: string; sampleAt?: Date | null } = {}): string {
  const currency = opts.currency ?? "USD";
  const lines = [ADS_CSV_HEADERS.join(",")];
  for (const r of rows) lines.push([r.gclid, ADS_CONVERSION_NAME, r.time, r.value.toFixed(2), currency].join(","));
  if (rows.length === 0 && opts.sampleAt) lines.push([ADS_SAMPLE_GCLID, ADS_CONVERSION_NAME, conversionTime(opts.sampleAt), "1.00", currency].join(","));
  return lines.join("\r\n") + "\r\n";
}

/** The private address of a company's file. Ends in .csv: Google refuses an address that does not. */
export function adsFeedUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/api/public/ads-conversions/${token}/conversions.csv`;
}
