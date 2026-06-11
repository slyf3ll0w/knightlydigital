import { getServerSession } from "next-auth";
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

  return <SettingsClient company={JSON.parse(JSON.stringify(company))} />;
}
