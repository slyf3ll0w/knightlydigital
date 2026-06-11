import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/app/register");

  // Booking/embed URLs must render identically on server and client (React
  // #418), so derive the origin here instead of from window.location.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? "");

  return <SettingsClient company={JSON.parse(JSON.stringify(company))} baseUrl={baseUrl} />;
}
