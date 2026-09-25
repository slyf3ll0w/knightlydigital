import { prisma } from "@/lib/db";
import { listPublicBookingTypes, menuTypes } from "@/lib/booking-runtime";

/**
 * The business's public identity as WorkBench hosts it: /book/<slug> is the
 * website on its 10DLC brand, and the footer on every booking page, the
 * /book/<slug>/privacy and /book/<slug>/sms-terms pages, and the campaign
 * filing all read from here. Carriers check that the brand's website shows
 * its address, phone and email, says what the business does, and carries
 * a privacy policy in the business's own name (Telnyx TELNYX_FAILED,
 * Lessly Holdings 2026-09-24) — so one loader, one set of facts.
 */
export type BusinessProfile = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  about: string | null;
  industry: string | null;
  logoUrl: string | null;
  services: string[];
};

export async function loadBusinessProfile(slug: string): Promise<BusinessProfile | null> {
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, phone: true, email: true, address: true, city: true, state: true, zip: true, website: true, about: true, industry: true, logoUrl: true },
  });
  if (!company) return null;
  const listed = await listPublicBookingTypes(slug, { skipGate: true }).catch(() => null);
  const menu = listed ? menuTypes(listed.types) : [];
  const names = new Set<string>();
  for (const t of menu) {
    if (t.services.length) for (const s of t.services) names.add(s.name.trim());
    else names.add(t.name.trim());
  }
  return { ...company, services: [...names].filter(Boolean).slice(0, 12) };
}

export async function loadBusinessProfileById(companyId: string): Promise<BusinessProfile | null> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  return c ? loadBusinessProfile(c.slug) : null;
}

/** "123 Oak St, Allen, TX 75013" — whatever parts are on file. */
export function profileAddress(p: Pick<BusinessProfile, "address" | "city" | "state" | "zip">): string {
  const cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [p.address, cityLine].filter(Boolean).join(", ");
}

/**
 * What the business does — the "About" the reviewers look for. The owner's
 * own words when they wrote some (Settings → Business Info), otherwise a
 * sentence built from the industry, city and services.
 */
export function aboutLine(p: Pick<BusinessProfile, "name" | "industry" | "city" | "state" | "services"> & { about?: string | null }): string {
  const own = p.about?.trim();
  if (own) return /[.!?]$/.test(own) ? own : `${own}.`;
  const trade = p.industry && p.industry !== "Other" ? `${p.industry.toLowerCase()} business` : "local service business";
  const where = p.city && p.state ? ` serving ${p.city}, ${p.state} and nearby areas` : "";
  const offers = p.services.length ? ` Services include ${listJoin(p.services.slice(0, 6).map((s) => s.toLowerCase()))}.` : "";
  return `${p.name} is a ${trade}${where}.${offers} Customers book service, get appointment reminders, and view and pay invoices online.`;
}

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * What the business page is missing before it can stand as the brand's
 * website. Pure — pinned by scripts/test-business-line.ts and used as a
 * registration pre-flight (a missing fact = a TELNYX_FAILED and a re-file).
 */
export function profileGaps(
  p: Pick<BusinessProfile, "phone" | "email" | "address" | "city" | "state" | "zip" | "services"> & { about?: string | null; industry?: string | null }
): string[] {
  const gaps: string[] = [];
  if (!p.phone?.trim()) gaps.push("your business phone");
  if (!p.email?.trim()) gaps.push("your business email");
  if (!p.address?.trim() || !p.city?.trim() || !p.state?.trim() || !p.zip?.trim()) gaps.push("your business address (street, city, state, ZIP)");
  if (!p.services.length) gaps.push("at least one service on your booking page");
  // Without an industry from the list, only the owner's own words can say what the business does.
  const knownTrade = Boolean(p.industry && p.industry !== "Other");
  if (!knownTrade && !p.about?.trim()) gaps.push("a short \"About your business\" description (or pick your industry)");
  return gaps;
}
