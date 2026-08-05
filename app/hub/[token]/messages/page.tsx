import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { brandHeader } from "@/lib/branding";
import HubMessagesThread from "./HubMessagesThread";

/**
 * The hub's Messages tab: a two-way thread with the company. Loading the
 * page marks company replies read (the GET poll keeps that honest while it
 * sits open).
 */
export default async function HubMessagesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      id: true,
      firstName: true,
      company: {
        select: { name: true, brandColor: true, documentColor: true, brandColorSecondary: true },
      },
    },
  });
  if (!contact) notFound();

  const messages = await prisma.portalMessage.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { sender: { select: { name: true } } },
  });

  await prisma.portalMessage.updateMany({
    where: { contactId: contact.id, direction: "OUTBOUND", readByClientAt: null },
    data: { readByClientAt: new Date() },
  });

  return (
    <HubMessagesThread
      token={token}
      companyName={contact.company.name}
      accent={brandHeader(contact.company)}
      initialMessages={messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        via: m.via,
        createdAt: m.createdAt.toISOString(),
        senderName: m.sender?.name ?? null,
      }))}
    />
  );
}
