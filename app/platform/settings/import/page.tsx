import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { getActiveFieldDefs } from "@/lib/contact-fields";
import ImportClient from "./ImportClient";

export const metadata: Metadata = { title: "Import Clients" };

export default async function ImportPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const [users, fieldDefs] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getActiveFieldDefs(actor.companyId),
  ]);

  return (
    <ImportClient
      actorId={actor.id}
      users={users}
      fieldDefs={fieldDefs.map((d) => ({ id: d.id, label: d.label }))}
    />
  );
}
