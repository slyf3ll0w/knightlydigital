import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ClientFieldsClient from "./ClientFieldsClient";

export const metadata: Metadata = { title: "Client Fields" };

export default async function ClientFieldsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const defs = await prisma.contactFieldDef.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
  });

  return (
    <ClientFieldsClient
      defs={defs.map((d) => ({
        id: d.id,
        label: d.label,
        type: d.type,
        options: Array.isArray(d.options) ? (d.options as string[]) : [],
        required: d.required,
        sortOrder: d.sortOrder,
        isActive: d.isActive,
      }))}
    />
  );
}
