import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import ContactForm from "../ContactForm";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const { type } = await searchParams;

  const canAssign = isManager(actor.role);
  const users = canAssign
    ? await prisma.user.findMany({
        where: { companyId: actor.companyId, isActive: true, NOT: { id: actor.id } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // /new?type=lead preselects Lead (pipeline board); default is a plain
  // client. The form has a toggle either way.
  return (
    <ContactForm
      mode="create"
      initial={{ status: type === "lead" ? "LEAD" : "ACTIVE" }}
      canAssign={canAssign}
      users={users}
    />
  );
}
