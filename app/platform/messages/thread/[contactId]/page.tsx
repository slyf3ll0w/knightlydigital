import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Mail } from "lucide-react";
import BackLink from "@/components/BackLink";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope } from "@/lib/permissions";
import Monogram from "@/components/Monogram";
import { fmtPhone } from "@/lib/format";
import TeamThread from "./TeamThread";
import SaveContactCard from "./SaveContactCard";

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
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyName: true,
      email: true,
      phone: true,
      kind: true,
      placeholder: true,
      smsOptOut: true,
      smsDisabled: true,
      // How a reply reaches them (lib/sms.ts companySender + canText, mirrored
      // for the composer's hint): attestation + a registered line + a number.
      company: {
        select: {
          smsAcknowledgedAt: true,
          lineNumber: true,
          messagingRegistration: { select: { status: true } },
        },
      },
    },
  });
  if (!contact) notFound();

  const line = contact.company.lineNumber;
  const textsReady =
    Boolean(contact.company.smsAcknowledgedAt) &&
    Boolean(line && !line.startsWith("pending:")) &&
    contact.company.messagingRegistration?.status === "ACTIVE" &&
    Boolean(contact.phone) &&
    !contact.smsOptOut &&
    !contact.smsDisabled;
  const channel =
    textsReady && line
      ? ({ kind: "sms", from: fmtPhone(line) } as const)
      : contact.email || contact.phone
        ? ({ kind: "portal" } as const)
        : ({ kind: "none" } as const);

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
        <BackLink href="/app/messages" />
        <Monogram name={name} size={40} />
        <div className="min-w-0 flex-1">
          <Link
            prefetch={false} href={`/app/contacts/${contact.id}`}
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

      {/* A thread started with a typed-in number: name them before (or after) the first text */}
      {contact.placeholder && <SaveContactCard contactId={contact.id} phone={contact.phone ? fmtPhone(contact.phone) : name} />}

      <TeamThread
        contactId={contact.id}
        contactFirstName={contact.placeholder ? "them" : contact.firstName}
        channel={channel}
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
