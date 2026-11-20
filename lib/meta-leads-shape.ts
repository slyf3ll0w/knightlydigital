/**
 * Facebook lead forms: the pure rules (no database, no network). What
 * Facebook's webhook says, what a lead's answers become, and the signature
 * check. Server side: lib/meta-leads.ts. Plan:
 * docs/plans/facebook-ads-2026-11-20.md.
 * Test: npx tsx scripts/test-meta-leads-shape.ts
 */
import { createHmac, timingSafeEqual } from "crypto";
import { META_API_VERSION } from "./meta-ads-shape";

export const META_DIALOG_URL = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`;

/** The fields asked for when reading one lead (the ones Meta's Retrieving Leads guide shows). */
export const LEAD_FIELDS = "created_time,id,ad_id,form_id,field_data";

/**
 * True when `header` (X-Hub-Signature-256: "sha256=<hex>") is Facebook's
 * signature of exactly these bytes under the app secret. No secret = false:
 * an unsigned world is refused, never trusted.
 */
export function verifyMetaSignature(rawBody: string, header: string | null | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header) return false;
  const [algo, hex] = header.trim().split("=");
  if (algo !== "sha256" || !hex || !/^[0-9a-f]{64}$/i.test(hex)) return false;
  const want = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const got = Buffer.from(hex, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

export type LeadgenNotice = { leadgenId: string; pageId: string; formId: string | null; adId: string | null };

const digits = (v: unknown): string => {
  const s = typeof v === "string" ? v : typeof v === "number" && Number.isSafeInteger(v) ? String(v) : "";
  return /^\d{5,25}$/.test(s) ? s : "";
};

/**
 * The leads named by one webhook delivery. Facebook batches: one body can
 * hold several entries (Pages) with several changes each. Anything that is
 * not a `leadgen` change with a lead id and a Page id is skipped. A lead
 * named twice in one body comes back once.
 */
export function parseLeadgenNotices(json: unknown): LeadgenNotice[] {
  const body = json as { object?: unknown; entry?: unknown } | null;
  if (!body || body.object !== "page" || !Array.isArray(body.entry)) return [];
  const out = new Map<string, LeadgenNotice>();
  for (const entry of body.entry as { id?: unknown; changes?: unknown }[]) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes as { field?: unknown; value?: Record<string, unknown> }[]) {
      if (!change || change.field !== "leadgen" || !change.value) continue;
      const leadgenId = digits(change.value.leadgen_id);
      const pageId = digits(change.value.page_id) || digits(entry.id);
      if (!leadgenId || !pageId) continue;
      if (!out.has(leadgenId)) out.set(leadgenId, { leadgenId, pageId, formId: digits(change.value.form_id) || null, adId: digits(change.value.ad_id) || null });
    }
  }
  return [...out.values()];
}

export type FormLead = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** every other answer, one "Question: answer" line each */
  message: string;
  /** the ad the form was on; null = filled in from the Page itself (not an ad) */
  adId: string | null;
};

const clean = (v: unknown, max: number): string =>
  typeof v === "string"
    ? // eslint-disable-next-line no-control-regex
      v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";

/** "what_kind_of_fence?" → "What kind of fence?" */
function questionLabel(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Answer";
}

/**
 * A lead as Facebook returns it (`field_data`: [{ name, values: [...] }]),
 * reduced to what a WorkBench lead holds. Facebook's standard questions are
 * named in English whatever the form's language (full_name, first_name,
 * last_name, email, phone_number, street_address, city, state, zip_code,
 * post_code); anything else is one of the advertiser's own questions and is
 * kept as a line of the message. Null when there is no name, or neither an
 * email nor a phone: nobody to file.
 */
export function leadFromFacebook(json: unknown): FormLead | null {
  const data = (json as { field_data?: unknown } | null)?.field_data;
  if (!Array.isArray(data)) return null;
  const known: Record<string, string> = {};
  const extra: string[] = [];
  for (const f of data as { name?: unknown; values?: unknown }[]) {
    const name = clean(f?.name, 120).toLowerCase();
    const value = Array.isArray(f?.values) ? (f.values as unknown[]).map((v) => clean(v, 1000)).filter(Boolean).join(", ") : "";
    if (!name || !value) continue;
    switch (name) {
      case "full_name":
      case "first_name":
      case "last_name":
      case "email":
      case "phone_number":
      case "street_address":
      case "city":
      case "state":
      case "zip_code":
      case "post_code":
        if (!known[name]) known[name] = value;
        break;
      default:
        if (extra.length < 20) extra.push(`${questionLabel(name)}: ${value}`);
    }
  }
  let firstName = (known.first_name ?? "").slice(0, 80);
  let lastName = (known.last_name ?? "").slice(0, 80);
  if (!firstName) {
    const parts = (known.full_name ?? "").split(" ").filter(Boolean);
    firstName = (parts[0] ?? "").slice(0, 80);
    lastName = lastName || parts.slice(1).join(" ").slice(0, 80);
  }
  const email = (known.email ?? "").slice(0, 200) || null;
  const phone = (known.phone_number ?? "").slice(0, 40) || null;
  if (!firstName || (!email && !phone)) return null;
  return {
    firstName,
    lastName: lastName || "—",
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
    phone,
    address: (known.street_address ?? "").slice(0, 300) || null,
    city: (known.city ?? "").slice(0, 100) || null,
    state: (known.state ?? "").slice(0, 40) || null,
    zip: (known.zip_code ?? known.post_code ?? "").slice(0, 20) || null,
    message: extra.join("\n").slice(0, 5000),
    adId: digits((json as { ad_id?: unknown }).ad_id) || null,
  };
}

/** The lead source a form lead is filed under: an ad's form is "Facebook Ads"; a form filled in from the Page itself is "Facebook". */
export function formLeadSource(lead: { adId: string | null }): string {
  return lead.adId ? "Facebook Ads" : "Facebook";
}

export type FacebookPage = { id: string; name: string; token: string; canAdvertise: boolean };

/** Pages from GET /me/accounts?fields=id,name,access_token,tasks. A Page without a token is one this sign-in cannot act for. */
export function parsePages(json: unknown): FacebookPage[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: FacebookPage[] = [];
  for (const p of data as { id?: unknown; name?: unknown; access_token?: unknown; tasks?: unknown }[]) {
    const id = digits(p?.id);
    const token = typeof p?.access_token === "string" ? p.access_token : "";
    if (!id || !token) continue;
    const tasks = Array.isArray(p.tasks) ? (p.tasks as unknown[]).map(String) : [];
    out.push({ id, name: clean(p.name, 120) || `Page ${id}`, token, canAdvertise: tasks.length === 0 || tasks.includes("ADVERTISE") || tasks.includes("MANAGE") });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Facebook's "you may not read this Page's leads" refusals: the Page's business has to give WorkBench leads access. */
export function isLeadsAccessRefusal(json: unknown): boolean {
  const err = (json as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (!err) return false;
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return err.code === 103 || ((err.code === 10 || err.code === 200) && message.includes("lead")) || message.includes("leads access") || message.includes("crm access");
}

/** What the page tells the owner when Facebook will not hand over leads. */
export const LEADS_ACCESS_FIX =
  "Facebook is not letting WorkBench read your leads. In Meta Business Suite open Settings, then Integrations, then Leads access, and give WorkBench (under CRMs) and yourself access to this Page's leads.";
