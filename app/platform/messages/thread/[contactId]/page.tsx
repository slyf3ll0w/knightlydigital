import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope } from "@/lib/permissions";
import Monogram from "@/components/Monogram";
import TeamThread from "./TeamThread";

/** One client's conversation — the team side of the hub Messages tab. */
export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { contactId } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
    select: { id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true },
  });
  if (!contact) notFound();

  const messages = await prisma.portalMessage.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { sender: { select: { name: true } } },
  });

  await prisma.portalMessage.updateMany({
    where: { contactId: contact.id, direction: "INBOUND", readByTeamAt: null },
    data: { readByTeamAt: new Date() },
  });

  const name = `${contact.firstName} ${contact.lastName}`.trim();

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/app/messages" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <Monogram name={name} size={40} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/app/contacts/${contact.id}`}
            className="text-base font-semibold text-gray-900 hover:underline truncate block"
          >
            {name}
            {contact.companyName ? (
              <span className="font-normal text-gray-500"> · {contact.companyName}</span>
            ) : null}
          </Link>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {contact.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} /> {contact.phone}
              </span>
            )}
            {contact.email && (
              <span className="flex items-center gap-1 truncate">
                <Mail size={11} /> {contact.email}
              </span>
            )}
          </div>
        </div>
      </div>

      <TeamThread
        contactId={contact.id}
        contactFirstName={contact.firstName}
        initialMessages={messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          via: m.via,
          createdAt: m.createdAt.toISOString(),
          senderName: m.sender?.name ?? null,
        }))}
      />
    </div>
  );
}
