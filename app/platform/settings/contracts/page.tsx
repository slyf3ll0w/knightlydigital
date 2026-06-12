import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ContractTemplatesClient from "./ContractTemplatesClient";

export const metadata: Metadata = { title: "Contract Templates" };

export default async function ContractTemplatesPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const templates = await prisma.contractTemplate.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <ContractTemplatesClient
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        body: t.body,
        isActive: t.isActive,
      }))}
    />
  );
}
