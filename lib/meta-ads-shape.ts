/**
 * Facebook ads: the pure rules and request shapes (no database, no network).
 * Server side: lib/meta-ads.ts. Plan: docs/plans/facebook-ads-2026-11-20.md.
 * Test: npx tsx scripts/test-meta-ads-shape.ts
 *
 * What is reported back to Facebook is each STEP a lead reaches (lead,
 * appointment booked, quote sent, job won, paid), not only payments: Facebook
 * credits an ad for what happens within 7 days of the click, and a paid job
 * usually lands later, so the early steps are what its ads can learn from.
 *
 * Two kinds of lead can be matched by Facebook:
 *   - a website lead whose arrival carries Facebook's click id (`fbclid`)
 *   - a lead from a Facebook instant form (Facebook's own lead id)
 * Nothing else is sent. No name, email, phone or address ever leaves, hashed
 * or not: ids only. Keep it that way (both privacy policies promise it).
 */

/** Graph API version every call uses (Marketing API v27.0, released 2026-11-04). */
export const META_API_VERSION = "v27.0";
export const META_GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

/** Facebook refuses an event whose time is more than 7 days before it is sent. */
export const META_EVENT_WINDOW_DAYS = 7;
/** Events per request. Facebook takes 1,000, but one bad event discards the whole request, so stay small. */
export const META_BATCH = 100;
/** What Facebook's reports show as the source system of a form lead's steps. */
export const META_CRM_NAME = "WorkBench";

export type MetaStep = "lead" | "appointment" | "quote" | "won" | "paid";

/** The steps in the order a lead reaches them, with the name Facebook sees and the words the page uses. */
export const META_STEPS: { step: MetaStep; name: string; label: string }[] = [
  { step: "lead", name: "Lead", label: "New lead" },
  { step: "appointment", name: "Schedule", label: "Appointment booked" },
  { step: "quote", name: "QuoteSent", label: "Quote sent" },
  { step: "won", name: "JobWon", label: "Job won" },
  { step: "paid", name: "Purchase", label: "Paid" },
];

const STEP_NAME = new Map(META_STEPS.map((s) => [s.step, s.name]));

/** What the database knows about one lead. Times are when each step happened; null = not yet. */
export type MetaLeadInput = {
  contactId: string;
  createdAt: Date;
  /** Contact.leadArrival as stored */
  arrival: unknown;
  /** Facebook's id for a lead that came from an instant form; null for a website lead */
  formLeadId?: string | null;
  appointmentAt?: Date | null;
  quoteSentAt?: Date | null;
  wonAt?: Date | null;
  payments?: { id: string; amount: number; paidAt: Date }[];
};

export type MetaMatch =
  | { kind: "form"; leadId: string }
  | { kind: "click"; fbc: string; url: string | null; userAgent: string | null };

export type MetaEvent = {
  contactId: string;
  step: MetaStep;
  /** the payment id for a paid step, "" otherwise */
  refId: string;
  time: Date;
  /** dollars; paid steps only */
  value: number | null;
  match: MetaMatch;
};

/** The one string that names a step of a lead: what MetaEventSent is unique on, and Facebook's event_id. */
export function metaEventKey(e: { contactId: string; step: string; refId: string }): string {
  return `${e.contactId}|${e.step}|${e.refId}`;
}

function field(raw: unknown, name: string): unknown {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>)[name] : undefined;
}

/** Facebook's click id as stored, or "" when it is missing or not something Facebook could have issued. Never changed: it is case-sensitive. */
export function cleanFbclid(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return /^[A-Za-z0-9_-]{8,400}$/.test(raw) ? raw : "";
}

/** A Facebook form lead id: 15 to 17 digits. "" when it is not one (Facebook rejects the event otherwise). */
export function cleanFormLeadId(raw: unknown): string {
  const s = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
  return /^\d{15,17}$/.test(s) ? s : "";
}

/** A dataset (pixel) id as typed: digits only, spaces forgiven. "" when it cannot be one. */
export function cleanDatasetId(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, "") : "";
  return /^\d{8,20}$/.test(s) ? s : "";
}

/** An Events Manager access token as pasted. "" when it cannot be one. */
export function cleanCapiToken(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_|-]{40,600}$/.test(s) ? s : "";
}

/** True when this arrival carries a Facebook click id (paid or unpaid: Facebook decides which were ads). */
export function hasFacebookClick(arrival: unknown): boolean {
  return cleanFbclid(field(arrival, "fbclid")) !== "";
}

/**
 * Facebook's "fbc" value built on the server from a click id:
 * fb.1.<when the click was first seen, ms>.<fbclid>. Null without a click id.
 */
export function fbcFromArrival(arrival: unknown, contactCreatedAt: Date): string | null {
  const fbclid = cleanFbclid(field(arrival, "fbclid"));
  if (!fbclid) return null;
  const at = field(arrival, "at");
  const created = contactCreatedAt.getTime();
  const seen = typeof at === "number" && Number.isFinite(at) && at > 0 && at <= created ? Math.round(at) : created;
  return `fb.1.${seen}.${fbclid}`;
}

function matchFor(lead: MetaLeadInput): MetaMatch | null {
  const leadId = cleanFormLeadId(lead.formLeadId);
  if (leadId) return { kind: "form", leadId };
  const fbc = fbcFromArrival(lead.arrival, lead.createdAt);
  if (!fbc) return null;
  const url = field(lead.arrival, "landing");
  const ua = field(lead.arrival, "ua");
  return {
    kind: "click",
    fbc,
    url: typeof url === "string" && /^https?:\/\//i.test(url) ? url : null,
    userAgent: typeof ua === "string" && ua.trim() ? ua.trim().slice(0, 400) : null,
  };
}

export type MetaEventSummary = {
  /** steps to send now, oldest first */
  events: MetaEvent[];
  /** leads Facebook could match (a click id or a form lead id) */
  leads: number;
};

/**
 * Every step Facebook will still accept and has not been told about.
 * Dropped: a lead with nothing to match on, a step already sent (`sent` holds
 * metaEventKey values), a step older than 7 days or dated in the future, a
 * step dated before the lead existed, a payment of 0 or less.
 */
export function buildMetaEvents(leads: MetaLeadInput[], sent: ReadonlySet<string>, now: Date): MetaEventSummary {
  const oldest = now.getTime() - META_EVENT_WINDOW_DAYS * 86400000;
  const events: MetaEvent[] = [];
  let matched = 0;
  for (const lead of leads) {
    const match = matchFor(lead);
    if (!match) continue;
    matched += 1;
    const born = lead.createdAt.getTime();
    const push = (step: MetaStep, at: Date | null | undefined, refId = "", value: number | null = null) => {
      if (!at) return;
      const t = at.getTime();
      if (!Number.isFinite(t) || t < born || t > now.getTime() || t < oldest) return;
      const e: MetaEvent = { contactId: lead.contactId, step, refId, time: at, value, match };
      if (sent.has(metaEventKey(e))) return;
      events.push(e);
    };
    push("lead", lead.createdAt);
    push("appointment", lead.appointmentAt);
    push("quote", lead.quoteSentAt);
    push("won", lead.wonAt);
    for (const p of lead.payments ?? []) {
      if (!Number.isFinite(p.amount) || p.amount <= 0) continue;
      push("paid", p.paidAt, p.id, Math.round(p.amount * 100) / 100);
    }
  }
  events.sort((a, b) => a.time.getTime() - b.time.getTime() || metaEventKey(a).localeCompare(metaEventKey(b)));
  return { events, leads: matched };
}

/** One event in the shape Facebook's Conversions API takes. */
export function eventPayload(e: MetaEvent, currency = "USD"): Record<string, unknown> {
  const money = e.value != null ? { value: e.value, currency } : {};
  const base = {
    event_name: STEP_NAME.get(e.step) ?? e.step,
    event_time: Math.floor(e.time.getTime() / 1000),
    event_id: metaEventKey(e),
  };
  if (e.match.kind === "form") {
    // Facebook's CRM shape: the lead id is the match, the source says a CRM sent it.
    return {
      ...base,
      action_source: "system_generated",
      user_data: { lead_id: e.match.leadId },
      custom_data: { event_source: "crm", lead_event_source: META_CRM_NAME, ...money },
    };
  }
  return {
    ...base,
    action_source: "website",
    ...(e.match.url ? { event_source_url: e.match.url } : {}),
    user_data: { fbc: e.match.fbc, ...(e.match.userAgent ? { client_user_agent: e.match.userAgent } : {}) },
    ...(e.value != null ? { custom_data: money } : {}),
  };
}

/** Events cut into request bodies. `testCode` routes them to Events Manager's Test events tab and counts nothing. */
export function eventBodies(events: MetaEvent[], opts: { testCode?: string; currency?: string; batch?: number } = {}): Record<string, unknown>[] {
  const size = opts.batch ?? META_BATCH;
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < events.length; i += size) {
    out.push({
      data: events.slice(i, i + size).map((e) => eventPayload(e, opts.currency)),
      ...(opts.testCode ? { test_event_code: opts.testCode } : {}),
    });
  }
  return out;
}

/** A test code from Events Manager's Test events tab ("TEST12345"). "" when it is not one. */
export function cleanTestCode(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^[A-Za-z0-9_-]{4,40}$/.test(s) ? s : "";
}

/** The made-up event behind "Send a test event": a website lead on the business's own page, matched to nobody. */
export function testEvent(pageUrl: string, now: Date): MetaEvent {
  return {
    contactId: "workbench-test",
    step: "lead",
    refId: String(now.getTime()),
    time: now,
    value: null,
    match: { kind: "click", fbc: `fb.1.${now.getTime()}.WorkBenchTestEvent`, url: pageUrl, userAgent: "WorkBench test event" },
  };
}

/** Facebook's own words for a refusal, on one line. */
export function metaErrorText(json: unknown, status: number): string {
  const err = field(json, "error");
  const pick = (k: string) => {
    const v = field(err, k);
    return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  };
  const text = pick("error_user_msg") || pick("message") || `Facebook answered ${status}.`;
  return text.slice(0, 300);
}

/** True when the refusal is about the token itself (expired, revoked, wrong): nothing will work until a new one is given. */
export function isTokenRefusal(json: unknown, status: number): boolean {
  const err = field(json, "error");
  const code = field(err, "code");
  const type = field(err, "type");
  if (status === 401 || code === 190 || code === 102) return true;
  return type === "OAuthException" && (code === 10 || code === 200);
}
