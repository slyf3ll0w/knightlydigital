import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ImportClient from "./ImportClient";

export const metadata: Metadata = { title: "Import Clients" };

export default async function ImportPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const users = await prisma.user.findMany({
    where: { companyId: actor.companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <ImportClient actorId={actor.id} users={users} />;
}
