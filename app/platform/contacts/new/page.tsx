import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import ContactForm from "../ContactForm";

export default async function NewContactPage() {
  const actor = await requirePageActor((a) => canSell(a.role));

  const canAssign = isManager(actor.role);
  const users = canAssign
    ? await prisma.user.findMany({
        where: { companyId: actor.companyId, isActive: true, NOT: { id: actor.id } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return <ContactForm mode="create" canAssign={canAssign} users={users} />;
}
