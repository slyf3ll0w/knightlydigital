/**
 * Connect Google Ads (one click, 2026-11-18): the shapes of what WorkBench
 * sends to Google and reads back. Pure (no Prisma, no fetch), so the server
 * code in lib/google-ads.ts and the unit test share them.
 *
 * Two Google APIs are involved, checked against Google's pages on 2026-11-18:
 *
 *  - Google Ads API (v26, scope .../auth/adwords): list the accounts the
 *    signed-in person can reach, and find or create ONE conversion action
 *    ("WorkBench paid job", type UPLOAD_CLICKS). Access is per Google Cloud
 *    project since 2026-09-09 (developer tokens are gone); "Explorer" level
 *    is enough for this.
 *  - Data Manager API (v1, scope .../auth/datamanager): send the payments.
 *    New offline-conversion uploads must use it since 2026-06-15.
 *
 * Plan: docs/plans/ads-connect-2026-11-18.md
 * Test: npx tsx scripts/test-google-ads-shape.ts
 */
import { ADS_CONVERSION_NAME, type AdsConversionRow } from "./ads-conversions";

export const GOOGLE_ADS_API = "https://googleads.googleapis.com/v26";
export const DATA_MANAGER_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";
export const GOOGLE_ADS_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/datamanager",
  "https://www.googleapis.com/auth/userinfo.email",
];
/** Google's cap on events in one Data Manager request. */
export const INGEST_BATCH = 2000;

/** "123-456-7890" or "customers/1234567890" → "1234567890"; anything else → "". */
export function customerIdDigits(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  const s = String(raw).replace(/^customers\//, "").replace(/-/g, "").trim();
  return /^\d{4,12}$/.test(s) ? s : "";
}

/** "1234567890" → "123-456-7890", the way Google Ads prints it. */
export function prettyCustomerId(id: string): string {
  const d = customerIdDigits(id);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
}

/* ───────────── accounts the signed-in person can use ───────────── */

/** One Google Ads account that can hold the conversion action (never a manager account). */
export type AdsAccount = {
  /** 10 digits, no dashes */
  customerId: string;
  name: string;
  /** The account the person signed in through: this one, or the manager account above it. */
  loginCustomerId: string;
};

/** `customers:listAccessibleCustomers` → the customer ids. */
export function parseAccessibleCustomers(json: unknown): string[] {
  const names = (json as { resourceNames?: unknown } | null)?.resourceNames;
  if (!Array.isArray(names)) return [];
  const out: string[] = [];
  for (const n of names) {
    const id = customerIdDigits(n);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Asked of each reachable account with itself as the login account: every
 * account under it that is not a manager, itself included (level 0) when it
 * is a plain account.
 */
export const CLIENT_ACCOUNTS_QUERY =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'";

/** `googleAds:search` rows of CLIENT_ACCOUNTS_QUERY → accounts under one login account. */
export function parseClientAccounts(json: unknown, loginCustomerId: string): AdsAccount[] {
  const rows = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return [];
  const out: AdsAccount[] = [];
  for (const r of rows) {
    const c = (r as { customerClient?: { id?: unknown; descriptiveName?: unknown; manager?: unknown } } | null)?.customerClient;
    if (!c || c.manager === true) continue;
    const customerId = customerIdDigits(c.id);
    if (!customerId) continue;
    const name = typeof c.descriptiveName === "string" && c.descriptiveName.trim() ? c.descriptiveName.trim().slice(0, 120) : prettyCustomerId(customerId);
    out.push({ customerId, name, loginCustomerId });
  }
  return out;
}

/** One list from several login accounts: an account reachable two ways is kept once, directly when possible. */
export function mergeAccounts(lists: AdsAccount[][]): AdsAccount[] {
  const byId = new Map<string, AdsAccount>();
  for (const a of lists.flat()) {
    const have = byId.get(a.customerId);
    if (!have || (a.loginCustomerId === a.customerId && have.loginCustomerId !== have.customerId)) byId.set(a.customerId, a);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.customerId.localeCompare(b.customerId));
}

/* ───────────── the conversion action ───────────── */

/** Finds the action by its name, whatever made it (WorkBench, Google's Advisor, or a person). */
export const CONVERSION_ACTION_QUERY = `SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.status FROM conversion_action WHERE conversion_action.name = '${ADS_CONVERSION_NAME}'`;

export type FoundAction = { id: string; usable: boolean; why?: string };

/** The action already in the account under our name, and whether payments can be sent to it. */
export function parseConversionAction(json: unknown): FoundAction | null {
  const rows = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(rows)) return null;
  let found: FoundAction | null = null;
  for (const r of rows) {
    const a = (r as { conversionAction?: { id?: unknown; type?: unknown; status?: unknown } } | null)?.conversionAction;
    const id = a && (typeof a.id === "string" || typeof a.id === "number") && /^\d{1,20}$/.test(String(a.id)) ? String(a.id) : "";
    if (!a || !id) continue;
    if (a.type !== "UPLOAD_CLICKS") {
      found ??= { id, usable: false, why: "A conversion action named WorkBench paid job exists in Google Ads but is not an import from clicks. Rename or remove it in Google Ads, then connect again." };
      continue;
    }
    if (a.status !== "ENABLED") {
      found ??= { id, usable: false, why: "The WorkBench paid job conversion action is turned off or removed in Google Ads. Turn it back on there, then connect again." };
      continue;
    }
    return { id, usable: true };
  }
  return found;
}

/** `conversionActions:mutate` body that creates the action: a click import, counted every time, valued by what was paid. */
export function createConversionActionBody() {
  return {
    operations: [
      {
        create: {
          name: ADS_CONVERSION_NAME,
          type: "UPLOAD_CLICKS",
          category: "CONVERTED_LEAD",
          status: "ENABLED",
          countingType: "MANY_PER_CLICK",
          valueSettings: { defaultValue: 0, defaultCurrencyCode: "USD", alwaysUseDefaultValue: false },
        },
      },
    ],
  };
}

/** The id of the action a mutate just made ("customers/1/conversionActions/987" → "987"). */
export function parseCreatedActionId(json: unknown): string {
  const first = (json as { results?: { resourceName?: unknown }[] } | null)?.results?.[0]?.resourceName;
  if (typeof first !== "string") return "";
  const m = /\/conversionActions\/(\d+)$/.exec(first);
  return m ? m[1] : "";
}

/* ───────────── sending the payments ───────────── */

export type IngestTarget = { customerId: string; loginCustomerId: string; conversionActionId: string };

/** "2026-11-18T14:03:22Z": our file time is already the form the Data Manager API takes. */
export function ingestBodies(rows: AdsConversionRow[], target: IngestTarget, opts: { validateOnly?: boolean; currency?: string } = {}) {
  const destination = {
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: target.customerId },
    loginAccount: { accountType: "GOOGLE_ADS", accountId: target.loginCustomerId || target.customerId },
    productDestinationId: target.conversionActionId,
  };
  const bodies: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += INGEST_BATCH) {
    bodies.push({
      destinations: [destination],
      events: rows.slice(i, i + INGEST_BATCH).map((r) => ({
        adIdentifiers: { gclid: r.gclid },
        eventTimestamp: r.time,
        eventSource: "WEB",
        // Google drops a second event with the same id for the same action, so sending a payment again is harmless
        transactionId: r.paymentId,
        conversionValue: r.value,
        currency: opts.currency ?? "USD",
      })),
      ...(opts.validateOnly ? { validateOnly: true } : {}),
    });
  }
  return bodies;
}

/** A short, plain reason from a Google error body, for the page ("Google said: …"). Never the raw JSON. */
export function googleErrorText(json: unknown, status: number): string {
  const err = (json as { error?: { message?: unknown; status?: unknown; details?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : "";
  const code = typeof err?.status === "string" ? err.status : "";
  let detail = "";
  if (Array.isArray(err?.details)) {
    for (const d of err.details as Record<string, unknown>[]) {
      const errors = (d as { errors?: { message?: unknown }[] }).errors;
      if (Array.isArray(errors) && typeof errors[0]?.message === "string") detail ||= errors[0].message as string;
      const violations = (d as { fieldViolations?: { description?: unknown }[] }).fieldViolations;
      if (Array.isArray(violations) && typeof violations[0]?.description === "string") detail ||= violations[0].description as string;
    }
  }
  const text = (detail || message || code || `Google answered ${status}`).replace(/\s+/g, " ").trim();
  return text.slice(0, 300);
}

/** True when Google's answer means the sign-in itself no longer works and the owner has to connect again. */
export function needsReconnect(status: number, json: unknown): boolean {
  if (status === 401) return true;
  const code = (json as { error?: { status?: unknown } } | null)?.error?.status;
  return code === "UNAUTHENTICATED";
}
