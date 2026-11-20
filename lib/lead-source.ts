/**
 * Lead sources: where a lead came from, in plain words.
 *
 * Three jobs, all pure (no Prisma, no window), so the browser, the API
 * routes, the report and the unit test share one set of rules:
 *
 *  1. `canonicalLeadSource` — one spelling per source. "google ads",
 *     "AdWords" and "Google Ads" are the same row on the report.
 *  2. `sourceFromArrival` — how a website visitor arrived (ad click ids,
 *     UTM tags, the referring site; gathered by public/embed.js on the
 *     business's own site, or by lib/arrival-client.ts on our hosted pages)
 *     becomes one of those names.
 *  3. `buildSourceRows` — the Lead sources report: leads, quoted, won,
 *     revenue and win rate per source.
 *
 * Plan + test recipes: docs/plans/lead-sources-2026-11-17.md.
 * Test: npx tsx scripts/test-lead-source.ts
 */

/** What the picker offers a person (the automatic names below are added to it once a company has used them). */
export const PICK_LEAD_SOURCES = [
  "Referral",
  "Repeat client",
  "Google search",
  "Google Ads",
  "Google Business Profile",
  "Facebook",
  "Instagram",
  "Nextdoor",
  "Yelp",
  "Yard sign",
  "Truck or trailer",
  "Flyer or door hanger",
] as const;

/** Names only the system writes. Listed so their spelling is canonical too. */
const AUTO_LEAD_SOURCES = [
  "Facebook Ads",
  "Instagram Ads",
  "Microsoft Ads",
  "Bing search",
  "Yahoo search",
  "DuckDuckGo search",
  "Email",
  "Another website",
  "Website (direct)",
  "Online booking",
  "Website estimate",
  "Website chat",
  "Phone call",
  "Online store",
  "Lead webhook",
  "Imported",
  "Google",
] as const;

/** The label a lead carries when nobody said where it came from. */
export const UNTRACKED_SOURCE = "Untracked";

const ALIASES: Record<string, string> = {
  adwords: "Google Ads",
  "google adwords": "Google Ads",
  "google ad": "Google Ads",
  "google ppc": "Google Ads",
  ppc: "Google Ads",
  gmb: "Google Business Profile",
  gbp: "Google Business Profile",
  "google my business": "Google Business Profile",
  "google business": "Google Business Profile",
  "google maps": "Google Business Profile",
  "google organic": "Google search",
  seo: "Google search",
  fb: "Facebook",
  "facebook ad": "Facebook Ads",
  "fb ads": "Facebook Ads",
  "meta ads": "Facebook Ads",
  ig: "Instagram",
  insta: "Instagram",
  "next door": "Nextdoor",
  "word of mouth": "Referral",
  wom: "Referral",
  referal: "Referral",
  referred: "Referral",
  referrals: "Referral",
  "friend or family": "Referral",
  repeat: "Repeat client",
  "repeat customer": "Repeat client",
  "existing client": "Repeat client",
  "existing customer": "Repeat client",
  yardsign: "Yard sign",
  "yard signs": "Yard sign",
  truck: "Truck or trailer",
  "truck wrap": "Truck or trailer",
  vehicle: "Truck or trailer",
  flyer: "Flyer or door hanger",
  "door hanger": "Flyer or door hanger",
  website: "Website (direct)",
  "phone": "Phone call",
};

const KNOWN = new Map<string, string>();
for (const label of [...PICK_LEAD_SOURCES, ...AUTO_LEAD_SOURCES]) KNOWN.set(label.toLowerCase(), label);

/** The key two spellings of one source share (report grouping, de-duping the picker). */
export function leadSourceKey(label: string | null | undefined): string {
  return (label ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * One spelling per source. A known name or alias in any casing comes back as
 * the standard label; anything else is kept as typed (trimmed, 60 chars).
 * Empty → null.
 */
export function canonicalLeadSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, 60).trim();
  if (!clean) return null;
  const key = clean.toLowerCase();
  return KNOWN.get(key) ?? ALIASES[key] ?? clean;
}

/* ───────────────────────── how a visitor arrived ───────────────────────── */

/** What the visitor's first page told us. Every field optional; ids are stored as sent. */
export type Arrival = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  /** Google Ads click id (and its two iOS variants) */
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  /** Meta click id — present on paid AND unpaid Facebook / Instagram clicks */
  fbclid?: string;
  /** Microsoft Ads click id */
  msclkid?: string;
  /** The page that linked here (origin + path, never the query) */
  referrer?: string;
  /** The first page of the business's site the visitor saw (origin + path) */
  landing?: string;
  /** When they first arrived (ms since epoch) */
  at?: number;
  /** True when the form sat on the business's own website (public/embed.js) */
  embedded?: boolean;
  /**
   * The browser that submitted the form (its User-Agent header), set by the
   * server with `withUserAgent`, never read from what the browser posted.
   * Facebook asks for it on a website event (lib/meta-ads-shape.ts).
   */
  ua?: string;
};

/** The arrival with the submitting browser's User-Agent header on it. Null stays null: no arrival, nothing to match. */
export function withUserAgent(arrival: Arrival | null, userAgent: string | null | undefined): Arrival | null {
  if (!arrival) return null;
  const ua = cleanText(userAgent ?? "", 400);
  return ua ? { ...arrival, ua } : arrival;
}

/** URL parameter → Arrival field. public/embed.js and lib/arrival-client.ts read the same list. */
export const ARRIVAL_PARAMS: [string, keyof Arrival][] = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_term", "utmTerm"],
  ["utm_content", "utmContent"],
  ["gclid", "gclid"],
  ["gbraid", "gbraid"],
  ["wbraid", "wbraid"],
  ["fbclid", "fbclid"],
  ["msclkid", "msclkid"],
];

const TEXT_FIELDS: [keyof Arrival, number][] = [
  ["utmSource", 120],
  ["utmMedium", 120],
  ["utmCampaign", 160],
  ["utmTerm", 160],
  ["utmContent", 160],
  ["gclid", 300],
  ["gbraid", 300],
  ["wbraid", 300],
  ["fbclid", 400],
  ["msclkid", 300],
];

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

/** Origin + path of an http(s) URL, or "" — a query string can carry a visitor's details and is never kept. */
function cleanUrl(v: unknown): string {
  const s = cleanText(v, 600);
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const u = new URL(s);
    return (u.origin + u.pathname).slice(0, 300);
  } catch {
    return "";
  }
}

/** Whatever a browser posted, reduced to the fields above. Null when nothing usable is left. */
export function sanitizeArrival(raw: unknown): Arrival | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Arrival = {};
  for (const [field, max] of TEXT_FIELDS) {
    const v = cleanText(src[field], max);
    if (v) (out as Record<string, unknown>)[field] = v;
  }
  const referrer = cleanUrl(src.referrer);
  if (referrer) out.referrer = referrer;
  const landing = cleanUrl(src.landing);
  if (landing) out.landing = landing;
  if (typeof src.at === "number" && Number.isFinite(src.at) && src.at > 0) out.at = Math.round(src.at);
  if (src.embedded === true) out.embedded = true;
  return Object.keys(out).length > 0 ? out : null;
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const PAID_MEDIUM = /^(cpc|ppc|cpm|cpv|sem|ad|ads|display|banner|retargeting|remarketing)$|paid/;

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * The plain name for how this visitor arrived, or null when nothing says.
 * Order: an ad click id is proof; then the tags the link was given; then the
 * site that sent them; then "they were on the business's own site".
 */
export function sourceFromArrival(a: Arrival | null | undefined): string | null {
  if (!a) return null;
  if (a.gclid || a.gbraid || a.wbraid) return "Google Ads";
  if (a.msclkid) return "Microsoft Ads";

  const src = (a.utmSource ?? "").toLowerCase().trim();
  const medium = (a.utmMedium ?? "").toLowerCase().trim();
  const campaign = (a.utmCampaign ?? "").toLowerCase();
  const paid = PAID_MEDIUM.test(medium);
  if (src) {
    const profile = /^(gbp|gmb|google[-_ ]?maps?|google[-_ ]?(my[-_ ]?)?business([-_ ]?profile)?)$/;
    if (profile.test(src) || (src === "google" && /gbp|gmb|business[-_ ]?profile|maps|local/.test(`${medium} ${campaign}`))) return "Google Business Profile";
    if (src.includes("google") || src === "adwords") return paid ? "Google Ads" : "Google search";
    if (src === "fb" || src === "meta" || src.includes("facebook")) return paid ? "Facebook Ads" : "Facebook";
    if (src === "ig" || src.includes("instagram")) return paid ? "Instagram Ads" : "Instagram";
    if (src.includes("bing") || src.includes("microsoft")) return paid ? "Microsoft Ads" : "Bing search";
    if (src.includes("nextdoor")) return "Nextdoor";
    if (src.includes("yelp")) return "Yelp";
    if (medium === "email" || src === "email" || src === "newsletter") return "Email";
    return canonicalLeadSource(titleCase(src));
  }
  if (medium === "email") return "Email";

  const host = hostOf(a.referrer);
  if (host) {
    // google.com, google.de, google.co.uk, google.com.au — never google.evil.example
    if (/(^|\.)google\.(com|[a-z]{2}|com?\.[a-z]{2})$/.test(host)) return "Google search";
    if (/(^|\.)bing\.com$/.test(host)) return "Bing search";
    if (/(^|\.)yahoo\.com$/.test(host)) return "Yahoo search";
    if (/(^|\.)duckduckgo\.com$/.test(host)) return "DuckDuckGo search";
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return "Facebook";
    if (/(^|\.)instagram\.com$/.test(host)) return "Instagram";
    if (/(^|\.)nextdoor\.com$/.test(host)) return "Nextdoor";
    if (/(^|\.)yelp\.com$/.test(host)) return "Yelp";
  }
  // Meta adds fbclid to paid and unpaid clicks alike, so it only says "Facebook"
  if (a.fbclid) return "Facebook";
  // On the business's own site an unknown referrer is another site sending
  // visitors. On our hosted page it is usually the business's own site
  // linking to its booking page, which says nothing: keep the door's name.
  if (host) return a.embedded ? "Another website" : null;
  return a.embedded ? "Website (direct)" : null;
}

/** The source a new website lead is filed under: what the arrival says, else the door it came through. */
export function leadSourceFor(arrival: Arrival | null | undefined, fallback: string): string {
  return sourceFromArrival(arrival) ?? fallback;
}

/** The extra facts behind a source, for the client page ("Campaign: Fence spring"). Empty when there are none. */
export function arrivalLines(a: Arrival | null | undefined): { label: string; value: string }[] {
  if (!a) return [];
  const out: { label: string; value: string }[] = [];
  if (a.utmCampaign) out.push({ label: "Campaign", value: a.utmCampaign });
  if (a.utmTerm) out.push({ label: "Search term", value: a.utmTerm });
  if (a.utmContent) out.push({ label: "Ad", value: a.utmContent });
  const host = hostOf(a.referrer);
  if (host) out.push({ label: "Came from", value: host });
  if (a.landing) {
    let path = a.landing;
    try {
      path = new URL(a.landing).pathname || "/";
    } catch {
      /* keep as stored */
    }
    out.push({ label: "First page", value: path === "/" ? "Home page" : path });
  }
  if (a.gclid || a.gbraid || a.wbraid) out.push({ label: "Ad click", value: "Google click ID saved" });
  else if (a.msclkid) out.push({ label: "Ad click", value: "Microsoft click ID saved" });
  return out;
}

/* ───────────────────────── the report ───────────────────────── */

export type SourceLead = {
  source: string | null;
  /** a quote was sent to them */
  quoted: boolean;
  /** they became a client */
  won: boolean;
  /** money collected from them */
  revenue: number;
};

export type SourceRow = {
  key: string;
  source: string;
  leads: number;
  quoted: number;
  won: number;
  revenue: number;
  /** won ÷ leads, whole percent; null with no leads */
  winRate: number | null;
};

/** One row per source (spellings merged), most leads first, then most revenue. */
export function buildSourceRows(leads: SourceLead[]): SourceRow[] {
  const map = new Map<string, SourceRow>();
  for (const l of leads) {
    const source = canonicalLeadSource(l.source) ?? UNTRACKED_SOURCE;
    const key = leadSourceKey(source);
    const row = map.get(key) ?? { key, source, leads: 0, quoted: 0, won: 0, revenue: 0, winRate: null };
    row.leads += 1;
    if (l.quoted) row.quoted += 1;
    if (l.won) row.won += 1;
    row.revenue += Number.isFinite(l.revenue) ? l.revenue : 0;
    map.set(key, row);
  }
  const rows = [...map.values()];
  for (const r of rows) {
    r.revenue = Math.round(r.revenue * 100) / 100;
    r.winRate = r.leads > 0 ? Math.round((r.won / r.leads) * 100) : null;
  }
  return rows.sort((a, b) => b.leads - a.leads || b.revenue - a.revenue || a.source.localeCompare(b.source));
}

/** The picker's list for one company: the standard names, then whatever else it has used, no spelling twice. */
export function pickerSources(used: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...PICK_LEAD_SOURCES, ...used]) {
    const label = canonicalLeadSource(raw);
    if (!label) continue;
    const key = leadSourceKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
