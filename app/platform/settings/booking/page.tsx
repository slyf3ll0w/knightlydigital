import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import BookingSettingsClient from "./BookingSettingsClient";

export default async function BookingSettingsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, slug: true, brandColor: true, bookingForm: true },
  });
  if (!company) redirect("/app/register");

  // Booking/embed URLs must render identically on server and client (React
  // #418), so derive the origin here instead of from window.location.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");

  return (
    <BookingSettingsClient
      company={JSON.parse(JSON.stringify(company))}
      baseUrl={baseUrl}
    />
  );
}
