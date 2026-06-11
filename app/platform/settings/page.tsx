import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/app/register");

  return <SettingsClient company={JSON.parse(JSON.stringify(company))} />;
}
