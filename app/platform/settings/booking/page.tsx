import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import BookingSettingsClient from "./BookingSettingsClient";

export default async function BookingSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

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
