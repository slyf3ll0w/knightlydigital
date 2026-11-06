import { prisma } from "@/lib/db";
import type { SiteAttribution } from "@/lib/site-track";

/**
 * Server half of the marketing site's first-party conversion tracking (the
 * browser half is lib/site-track.ts). One row per event in SiteEvent; the
 * console reads them at /superadmin/traffic. Nothing personal is stored:
 * no email, no IP, no user agent.
 */

export const SITE_EVENT_NAMES = new Set(["cta_click", "signup", "apply_submit", "tool_pdf", "tool_draft", "tool_open", "tool_email"]);

export type SiteEventInput = SiteAttribution & {
  name: string;
  label?: string | null;
  path?: string | null;
  visitorId?: string | null;
};

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Validates loosely typed input (a beacon body, a form field) into a row. */
export function sanitizeAttribution(input: unknown): SiteAttribution {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: SiteAttribution = {};
  const referrer = str(o.referrer, 200);
  const landing = str(o.landing, 200);
  const utmSource = str(o.utmSource, 120);
  const utmMedium = str(o.utmMedium, 120);
  const utmCampaign = str(o.utmCampaign, 120);
  const utmContent = str(o.utmContent, 120);
  const utmTerm = str(o.utmTerm, 120);
  if (referrer) out.referrer = referrer;
  if (landing) out.landing = landing;
  if (utmSource) out.utmSource = utmSource;
  if (utmMedium) out.utmMedium = utmMedium;
  if (utmCampaign) out.utmCampaign = utmCampaign;
  if (utmContent) out.utmContent = utmContent;
  if (utmTerm) out.utmTerm = utmTerm;
  return out;
}

export async function recordSiteEvent(input: SiteEventInput): Promise<boolean> {
  const name = str(input.name, 40);
  if (!name || !SITE_EVENT_NAMES.has(name)) return false;
  const attr = sanitizeAttribution(input);
  try {
    await prisma.siteEvent.create({
      data: {
        name,
        label: str(input.label, 120),
        path: str(input.path, 200) ?? attr.landing ?? "/",
        referrer: attr.referrer ?? null,
        utmSource: attr.utmSource ?? null,
        utmMedium: attr.utmMedium ?? null,
        utmCampaign: attr.utmCampaign ?? null,
        utmContent: attr.utmContent ?? null,
        utmTerm: attr.utmTerm ?? null,
        visitorId: str(input.visitorId, 64),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** One line for the sign-up record: "utm: google / cpc / nov-launch · from: reddit.com/r/plumbing · landed on /trades/plumbing". */
export function describeAttribution(attr: SiteAttribution): string | null {
  const parts: string[] = [];
  const utm = [attr.utmSource, attr.utmMedium, attr.utmCampaign].filter(Boolean).join(" / ");
  if (utm) parts.push(`utm: ${utm}`);
  if (attr.referrer) parts.push(`from: ${attr.referrer.replace(/^https?:\/\//, "")}`);
  if (attr.landing) parts.push(`landed on ${attr.landing}`);
  return parts.length ? parts.join(" · ") : null;
}
