import { prisma } from "@/lib/db";
import { sanitizeBookingForm, DEFAULT_BOOKING_FORM, type BookingFormConfig } from "@/lib/booking-form";

/**
 * Multi-form support. Each company has any number of WebForm rows; the one
 * marked isDefault answers the original /book/[companySlug] and
 * /embed/[companySlug] URLs (snippets already on customer sites keep
 * working). Companies created before multi-form have their config on
 * Company.bookingForm — migrated into a default row the first time anything
 * asks for their forms.
 */

export type WebFormRow = {
  id: string;
  name: string;
  slug: string;
  type: "INQUIRY" | "BOOKING" | "SERVICE_REQUEST";
  isDefault: boolean;
  isActive: boolean;
  config: BookingFormConfig;
};

export function slugifyFormName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "form"
  );
}

/** Per-type defaults applied when a form is created. */
export function defaultConfigForType(type: WebFormRow["type"]): BookingFormConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_BOOKING_FORM)) as BookingFormConfig;
  if (type === "INQUIRY") {
    base.fields.date.show = false;
    base.showPreferredDate = false;
    base.service.show = false;
    base.button.label = "Send Message";
    base.header.description = "Tell us a bit about what you need and we'll reach out.";
  }
  if (type === "BOOKING") {
    base.fields.date = { show: true, required: true, label: "Preferred date" };
    base.button.label = "Book Estimate";
    base.header.description = "Pick a date that works and we'll confirm your estimate.";
  }
  if (type === "SERVICE_REQUEST") {
    base.service.show = false;
    base.fields.date.show = false;
    base.showPreferredDate = false;
    base.button.label = "Order Service";
    base.header.description = "Choose a service and we'll get you on the schedule.";
  }
  return base;
}

function toRow(f: {
  id: string;
  name: string;
  slug: string;
  type: string;
  isDefault: boolean;
  isActive: boolean;
  config: unknown;
}): WebFormRow {
  return {
    id: f.id,
    name: f.name,
    slug: f.slug,
    type: f.type as WebFormRow["type"],
    isDefault: f.isDefault,
    isActive: f.isActive,
    config: sanitizeBookingForm(f.config),
  };
}

/** Migrate the legacy single-form config into a default WebForm row. */
async function ensureDefaultForm(companyId: string, legacyConfig: unknown): Promise<void> {
  const count = await prisma.webForm.count({ where: { companyId } });
  if (count > 0) return;
  await prisma.webForm.create({
    data: {
      companyId,
      name: "Booking Form",
      slug: "default",
      type: "BOOKING",
      isDefault: true,
      config: sanitizeBookingForm(legacyConfig) as object,
    },
  });
}

export async function listWebForms(companyId: string, legacyConfig: unknown): Promise<WebFormRow[]> {
  await ensureDefaultForm(companyId, legacyConfig);
  const forms = await prisma.webForm.findMany({
    where: { companyId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return forms.map(toRow);
}

/**
 * Resolve the form a public URL refers to. No formSlug → the default form
 * (the company's original single form).
 */
export async function resolveWebForm(
  companySlug: string,
  formSlug?: string
): Promise<{ company: NonNullable<Awaited<ReturnType<typeof prisma.company.findUnique>>>; form: WebFormRow } | null> {
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) return null;
  // Suspended companies disappear from public booking entirely — the booking
  // page and its POST both resolve through here, so this is the one gate.
  if (company.suspendedAt) return null;

  await ensureDefaultForm(company.id, company.bookingForm);

  const form = formSlug
    ? await prisma.webForm.findFirst({
        where: { companyId: company.id, slug: formSlug, isActive: true },
      })
    : (await prisma.webForm.findFirst({
        where: { companyId: company.id, isDefault: true, isActive: true },
      })) ??
      (await prisma.webForm.findFirst({
        where: { companyId: company.id, isActive: true },
        orderBy: { createdAt: "asc" },
      }));

  if (!form) return null;
  return { company, form: toRow(form) };
}
