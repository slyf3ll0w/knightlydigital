import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { sanitizeBusinessHours } from "@/lib/business-hours";
import { inPreview } from "@/lib/preview";
import { bookingTypeInclude, eligibleMembers } from "@/lib/booking-runtime";
import { sanitizeIntake } from "@/lib/booking-intake";
import { sanitizeBookingPage } from "@/lib/booking-page";
import { brandAccent } from "@/lib/branding";
import BookingHome from "./BookingHome";

export default async function OnlineBookingPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const [company, bookableCount, types] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        slug: true,
        brandColor: true,
        brandColorSecondary: true,
        bookingPage: true,
        hubBookingTypeId: true,
        businessHours: true,
        serviceZips: true,
        arrivalWindowMinutes: true,
        bookingDriveLimitMinutes: true,
        timezone: true,
      },
    }),
    prisma.user.count({ where: { companyId, isActive: true, bookable: true } }),
    prisma.bookingType.findMany({
      where: { companyId },
      include: bookingTypeInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!company) redirect("/app/register");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");

  return (
    <BookingHome
      companySlug={company.slug}
      baseUrl={baseUrl}
      previewMode={await inPreview(companyId)}
      look={sanitizeBookingPage(company.bookingPage)}
      brandAccent={brandAccent(company)}
      rules={{
        hours: sanitizeBusinessHours(company.businessHours),
        serviceZips: company.serviceZips,
        arrivalWindowMinutes: company.arrivalWindowMinutes,
        bookingDriveLimitMinutes: company.bookingDriveLimitMinutes ?? 0,
        timezone: company.timezone,
        bookableCount,
      }}
      hubFormId={company.hubBookingTypeId}
      items={types.map((t) => {
        const intake = sanitizeIntake(t.intake, t.kind, t.mode);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          kind: t.kind,
          mode: t.mode,
          isActive: t.isActive,
          showOnPage: t.showOnPage,
          durationMinutes: t.durationMinutes,
          stepMinutes: t.stepMinutes,
          confirmation: t.confirmation,
          paymentMode: t.paymentMode,
          serviceCount: t.services.filter((s) => s.workItem.isActive).length,
          questionCount: intake.customFields.length,
          takers: eligibleMembers(t).map((m) => m.user.name),
        };
      })}
    />
  );
}
