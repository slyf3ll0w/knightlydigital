/**
 * The website brand brief — what the owner tells the studio about their
 * business that the app doesn't already know (Settings → Website). Pure:
 * no Prisma, no React, so the site repo's data loader and
 * scripts/test-website.ts can share the shape.
 *
 * Everything here is copy or facts the owner typed; the site never invents
 * reviews, licenses or years in business — if it's not here or on the
 * company record, it's not on the site.
 */

export type WebsiteFaq = { q: string; a: string };

export type WebsiteBrief = {
  /** One line under the name. ≤ 120 chars. */
  tagline: string;
  /** The owner's story in their own words — the voice of the site. */
  story: string;
  /** Year the business started (null = don't say). */
  foundedYear: number | null;
  /** License numbers / certifications exactly as they appear ("TACLA 12345C"). */
  licenses: string[];
  insured: boolean;
  /** Warranty / guarantee wording, verbatim. */
  guarantee: string;
  /** Cities / neighborhoods they actually serve — one page each, no more. */
  serviceAreas: string[];
  /** What sets them apart, ≤ 5 short lines. */
  differentiators: string[];
  /** Brands they install / are certified on. */
  brands: string[];
  emergency: boolean;
  /** "Financing available through …" — empty = no financing section. */
  financing: string;
  /** Up to 3 sites they like (any trade), for the direction step. */
  likedSites: string[];
  /** What they hate about competitors' sites / their old site. */
  dislikes: string;
  /** Tone words (chips): e.g. straightforward, warm, premium, family, no-nonsense. */
  tone: string[];
  /** Show price-book prices on the site. */
  showPrices: boolean;
  googleBusinessUrl: string;
  socials: {
    facebook: string;
    instagram: string;
    yelp: string;
    nextdoor: string;
    youtube: string;
    tiktok: string;
  };
  faqs: WebsiteFaq[];
};

export const TONE_WORDS = [
  "straightforward",
  "warm",
  "premium",
  "family-run",
  "no-nonsense",
  "friendly",
  "technical",
  "fast",
  "old-school",
  "modern",
] as const;

export const SOCIAL_KEYS = ["facebook", "instagram", "yelp", "nextdoor", "youtube", "tiktok"] as const;

const LIMITS = {
  tagline: 120,
  story: 3000,
  guarantee: 400,
  financing: 200,
  dislikes: 1000,
  url: 300,
  short: 80,
  faqQ: 160,
  faqA: 800,
  list: 12,
  faqs: 12,
  likedSites: 3,
  differentiators: 5,
} as const;

export function emptyBrief(): WebsiteBrief {
  return {
    tagline: "",
    story: "",
    foundedYear: null,
    licenses: [],
    insured: false,
    guarantee: "",
    serviceAreas: [],
    differentiators: [],
    brands: [],
    emergency: false,
    financing: "",
    likedSites: [],
    dislikes: "",
    tone: [],
    showPrices: false,
    googleBusinessUrl: "",
    socials: { facebook: "", instagram: "", yelp: "", nextdoor: "", youtube: "", tiktok: "" },
    faqs: [],
  };
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, max: number, each: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = str(x, each);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** http(s) only — a brief is public data, never let "javascript:" through. */
export function safeUrl(v: unknown): string {
  const s = str(v, LIMITS.url);
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Whatever was stored (or posted) → a complete, bounded brief. */
export function sanitizeBrief(raw: unknown): WebsiteBrief {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = emptyBrief();
  const year = Number(r.foundedYear);
  const thisYear = new Date().getFullYear();
  const socialsRaw = (r.socials && typeof r.socials === "object" ? r.socials : {}) as Record<string, unknown>;
  const socials = { ...base.socials };
  for (const k of SOCIAL_KEYS) socials[k] = safeUrl(socialsRaw[k]);
  const faqs: WebsiteFaq[] = [];
  if (Array.isArray(r.faqs)) {
    for (const f of r.faqs) {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      const q = str(o.q, LIMITS.faqQ);
      const a = str(o.a, LIMITS.faqA);
      if (q && a) faqs.push({ q, a });
      if (faqs.length >= LIMITS.faqs) break;
    }
  }
  return {
    tagline: str(r.tagline, LIMITS.tagline),
    story: str(r.story, LIMITS.story),
    foundedYear: Number.isInteger(year) && year >= 1850 && year <= thisYear ? year : null,
    licenses: strList(r.licenses, LIMITS.list, LIMITS.short),
    insured: r.insured === true,
    guarantee: str(r.guarantee, LIMITS.guarantee),
    serviceAreas: strList(r.serviceAreas, 20, LIMITS.short),
    differentiators: strList(r.differentiators, LIMITS.differentiators, 160),
    brands: strList(r.brands, LIMITS.list, LIMITS.short),
    emergency: r.emergency === true,
    financing: str(r.financing, LIMITS.financing),
    likedSites: strList(r.likedSites, LIMITS.likedSites, LIMITS.url).map(safeUrl).filter(Boolean),
    dislikes: str(r.dislikes, LIMITS.dislikes),
    tone: strList(r.tone, 5, 30).filter((t) => (TONE_WORDS as readonly string[]).includes(t)),
    showPrices: r.showPrices === true,
    googleBusinessUrl: safeUrl(r.googleBusinessUrl),
    socials,
    faqs,
  };
}

export type BriefGap = { key: string; label: string };

/**
 * What the studio still needs before it can start — shown on the Settings
 * page as a checklist and in the console queue. The company facts (phone,
 * address, services, logo) come from the company record, so they're checked
 * by the caller and passed in as `companyGaps`.
 */
export function briefGaps(brief: WebsiteBrief, photoCount: number): BriefGap[] {
  const gaps: BriefGap[] = [];
  if (!brief.story) gaps.push({ key: "story", label: "Your story, in your own words" });
  if (!brief.serviceAreas.length) gaps.push({ key: "serviceAreas", label: "The cities you serve" });
  if (!brief.differentiators.length) gaps.push({ key: "differentiators", label: "What sets you apart" });
  if (!brief.tone.length) gaps.push({ key: "tone", label: "How the site should sound" });
  if (photoCount === 0) gaps.push({ key: "photos", label: "At least one real photo (truck, team, your work)" });
  return gaps;
}

/** The brief, stripped to what the public site may carry (same shape today; the seam is the point). */
export function publicBrief(brief: WebsiteBrief): WebsiteBrief {
  // likedSites and dislikes are studio inputs, not site content
  return { ...brief, likedSites: [], dislikes: "" };
}
