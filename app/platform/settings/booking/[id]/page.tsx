import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { sanitizeBookingForm } from "@/lib/booking-form";
import { getActiveFieldDefs } from "@/lib/contact-fields";
import { inPreview } from "@/lib/preview";
import WebFormEditor from "./WebFormEditor";

export default async function WebFormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));

  const { id } = await params;
  const [form, company, fieldDefs, workItems, bookingTypes] = await Promise.all([
    prisma.webForm.findFirst({ where: { id, companyId: actor.companyId } }),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true, slug: true, brandColor: true, brandColorSecondary: true },
    }),
    getActiveFieldDefs(actor.companyId),
    prisma.workItem.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true, description: true, unitPrice: true, durationMinutes: true },
      orderBy: { name: "asc" },
    }),
    prisma.bookingType.findMany({
      where: { companyId: actor.companyId },
      select: { id: true, name: true, kind: true, isActive: true, paymentMode: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!form) notFound();
  if (!company) redirect("/app/register");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");

  return (
    <WebFormEditor
      form={{
        id: form.id,
        name: form.name,
        slug: form.slug,
        type: form.type,
        isDefault: form.isDefault,
        config: sanitizeBookingForm(form.config),
      }}
      company={{
        name: company.name,
        slug: company.slug,
        brandColor: company.brandColorSecondary ?? company.brandColor,
      }}
      baseUrl={baseUrl}
      previewMode={await inPreview(actor.companyId)}
      contactFieldDefs={fieldDefs.map((d) => ({ id: d.id, label: d.label }))}
      bookingTypes={bookingTypes}
      priceBookItems={workItems.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        price: Number(w.unitPrice),
        durationMinutes: w.durationMinutes,
      }))}
    />
  );
}
