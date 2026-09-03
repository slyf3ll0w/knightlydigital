import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { bookingTypeInclude } from "@/lib/booking-runtime";
import { sanitizeIntake } from "@/lib/booking-intake";
import { getActiveFieldDefs } from "@/lib/contact-fields";
import { geocodingEnabled } from "@/lib/geocoding";
import { getProcessor } from "@/lib/payments";
import { inPreview } from "@/lib/preview";
import ItemEditor from "./ItemEditor";

/** /app/settings/booking/[id] — one item's editor. Old form ids redirect to the item they became. */
export default async function BookingItemEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const { id } = await params;

  const [type, company, team, workItems, fieldDefs] = await Promise.all([
    prisma.bookingType.findFirst({ where: { id, companyId: actor.companyId }, include: bookingTypeInclude }),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: {
        name: true,
        slug: true,
        timezone: true,
        arrivalWindowMinutes: true,
        bookingDriveLimitMinutes: true,
        lat: true,
        finixMerchantId: true,
        finixOnboardingState: true,
        surchargeEnabled: true,
      },
    }),
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true, role: true, bookable: true, meetingLink: true },
      orderBy: { name: "asc" },
    }),
    prisma.workItem.findMany({
      where: { companyId: actor.companyId, isActive: true, type: "SERVICE" },
      select: { id: true, name: true, description: true, unitPrice: true, priceDisplay: true, durationMinutes: true, depositType: true, depositValue: true },
      orderBy: { name: "asc" },
    }),
    getActiveFieldDefs(actor.companyId),
  ]);
  if (!type) {
    const migrated = await prisma.bookingType.findFirst({ where: { legacyFormId: id, companyId: actor.companyId }, select: { id: true } });
    if (migrated) redirect(`/app/settings/booking/${migrated.id}`);
    notFound();
  }
  if (!company) redirect("/app/register");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");

  const processor = getProcessor();
  const paymentsReady =
    processor.name === "finix" && processor.live && Boolean(company.finixMerchantId) && company.finixOnboardingState === "APPROVED";

  return (
    <ItemEditor
      item={{
        id: type.id,
        slug: type.slug,
        name: type.name,
        description: type.description,
        kind: type.kind,
        mode: type.mode,
        isActive: type.isActive,
        showOnPage: type.showOnPage,
        durationMinutes: type.durationMinutes,
        stepMinutes: type.stepMinutes,
        bufferBeforeMinutes: type.bufferBeforeMinutes,
        bufferAfterMinutes: type.bufferAfterMinutes,
        leadHours: type.leadHours,
        horizonDays: type.horizonDays,
        maxPerDay: type.maxPerDay,
        maxShownPerDay: type.maxShownPerDay,
        confirmation: type.confirmation,
        arrivalWindowMinutes: type.arrivalWindowMinutes,
        meetingLink: type.meetingLink,
        paymentMode: type.paymentMode,
        assignment: type.assignment,
        clientCanReschedule: type.clientCanReschedule,
        clientCanCancel: type.clientCanCancel,
        cutoffHours: type.cutoffHours,
        members: type.members.map((m) => ({ userId: m.userId, priority: m.priority })),
        services: type.services.map((s) => s.workItemId),
        intake: sanitizeIntake(type.intake, type.kind, type.mode),
      }}
      team={team.map((u) => ({ id: u.id, name: u.name, role: u.role, bookable: u.bookable, hasMeetingLink: Boolean(u.meetingLink) }))}
      priceBook={workItems.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        price: Number(w.unitPrice),
        priceDisplay: w.priceDisplay,
        durationMinutes: w.durationMinutes,
        depositType: w.depositType,
        depositValue: w.depositValue == null ? null : Number(w.depositValue),
      }))}
      contactFieldDefs={fieldDefs.map((d) => ({ id: d.id, label: d.label }))}
      company={{
        name: company.name,
        slug: company.slug,
        timezone: company.timezone,
        arrivalWindowMinutes: company.arrivalWindowMinutes,
        driveLimitMinutes: company.bookingDriveLimitMinutes ?? 0,
        geocoding: geocodingEnabled(),
        shopPinned: company.lat != null,
        paymentsReady,
        surchargeEnabled: company.surchargeEnabled,
      }}
      baseUrl={baseUrl}
      previewMode={await inPreview(actor.companyId)}
    />
  );
}
