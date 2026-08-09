import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) redirect("/app/register");

  const { s } = await searchParams;

  return (
    <SettingsClient
      company={JSON.parse(JSON.stringify(company))}
      isOwner={actor.role === "OWNER"}
      initialSection={s}
    />
  );
}
