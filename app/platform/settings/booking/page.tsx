import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { listWebForms } from "@/lib/web-forms";
import FormsListClient from "./FormsListClient";

export default async function BookingFormsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, slug: true, bookingForm: true },
  });
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
      forms={forms.map((f) => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        type: f.type,
        isDefault: f.isDefault,
        isActive: f.isActive,
      }))}
    />
  );
}
