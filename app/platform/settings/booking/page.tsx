import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { listWebForms } from "@/lib/web-forms";
import { sanitizeBusinessHours } from "@/lib/business-hours";
import { inPreview } from "@/lib/preview";
import FormsListClient from "./FormsListClient";
import SchedulingSettingsCard from "./SchedulingSettingsCard";

export default async function BookingFormsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const [company, bookableCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        slug: true,
        bookingForm: true,
        businessHours: true,
        serviceZips: true,
        arrivalWindowMinutes: true,
        bookingDriveLimitMinutes: true,
        timezone: true,
      },
    }),
    prisma.user.count({ where: { companyId, isActive: true, bookable: true } }),
  ]);
  if (!company) redirect("/app/register");

  const forms = await listWebForms(companyId, company.bookingForm);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");

  return (
    <FormsListClient
      companySlug={company.slug}
      baseUrl={baseUrl}
      previewMode={await inPreview(companyId)}
      forms={forms.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        type: f.type,
        isDefault: f.isDefault,
        isActive: f.isActive,
      }))}
      schedulingCard={
        <SchedulingSettingsCard
          hours={sanitizeBusinessHours(company.businessHours)}
          serviceZips={company.serviceZips}
          arrivalWindowMinutes={company.arrivalWindowMinutes}
          bookingDriveLimitMinutes={company.bookingDriveLimitMinutes ?? 0}
          timezone={company.timezone}
          bookableCount={bookableCount}
        />
      }
    />
  );
}
