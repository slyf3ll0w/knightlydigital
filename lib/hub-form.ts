import { prisma } from "@/lib/db";
import { brandAccent } from "@/lib/branding";
import { loadBookingItem, type LoadedItem } from "@/lib/booking-public";
import { bookingTypeInclude, toPublicBookingType } from "@/lib/booking-runtime";
import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";

/**
 * The client hub's "Get work done" form. `Company.hubBookingTypeId` names ONE
 * booking item (any kind — a contact form, a quote request, a paid booking)
 * that existing clients see in their hub instead of the built-in title +
 * details request form. Null, the default, is the plain form. One knob,
 * nothing preset: the same idea as Jobber's "default request form" and
 * Housecall Pro's portal reusing the business's own booking flow.
 *
 * Inside the hub the client is already on file, so the renderers skip the
 * fields they have, the public submit routes take the hub token instead of a
 * captcha, and the request lands as `source: "client_hub"` — never on the
 * Leads board (repeat business, not a lead).
 */

type HubCompany = { id: string; slug: string; hubBookingTypeId: string | null };

/** The chosen item, loaded like the public page would (gate included), or null = plain form. */
export async function loadHubForm(company: HubCompany): Promise<LoadedItem | null> {
  if (!company.hubBookingTypeId) return null;
  const type = await prisma.bookingType.findFirst({
    where: { id: company.hubBookingTypeId, companyId: company.id, isActive: true },
    select: { slug: true },
  });
  if (!type) return null;
  return loadBookingItem(company.slug, type.slug);
}

/** Heading / intro / button for the hub's "Get work done" card, or null = the built-in words. */
export async function hubFormWords(
  company: HubCompany & { arrivalWindowMinutes: number }
): Promise<{ heading: string; description: string | null; buttonLabel: string } | null> {
  if (!company.hubBookingTypeId) return null;
  const type = await prisma.bookingType.findFirst({
    where: { id: company.hubBookingTypeId, companyId: company.id, isActive: true },
    include: bookingTypeInclude,
  });
  if (!type) return null;
  const pub = toPublicBookingType(type, company);
  return { heading: pub.heading, description: pub.description, buttonLabel: pub.buttonLabel };
}

/** The hub wears the company's hub chrome, not the booking page's saved look. */
export function hubFormAppearance(company: { name: string; brandColor: string | null; brandColorSecondary: string | null }): ScheduleAppearance {
  return { dark: false, transparent: false, accent: brandAccent(company), fontName: null, fontHref: null, zoom: 1, title: "", description: "" };
}

/**
 * Who is submitting from their hub, if the public POST carried a hub token
 * that belongs to a contact of THIS company. Tenant-scoped on purpose: a
 * token from another company is just an anonymous visitor (captcha applies).
 */
export async function hubSubmitter(token: unknown, companyId: string) {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return null;
  return prisma.contact.findFirst({
    where: { hubToken: token, companyId },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, assignedToId: true },
  });
}
