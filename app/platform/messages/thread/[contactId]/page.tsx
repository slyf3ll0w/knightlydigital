import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { threadMedia } from "@/lib/message-media";
import { requirePageActor, canSell, contactScope } from "@/lib/permissions";
import { fmtPhone } from "@/lib/format";
import TeamThread from "./TeamThread";
import SaveContactCard from "./SaveContactCard";

export const metadata: Metadata = { title: "Messages" };

/**
 * One client's conversation — the team side of the hub Messages tab. The
 * page is a thin loader: TeamThread is the whole screen (a full-viewport
 * conversation on phones, a full-height pane on desktop — template.tsx
 * passes <main>'s height down for this route).
 */
export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { contactId } = await params;
  const [contact, messages] = await Promise.all([
    prisma.contact.findFirst({
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
            timezone: true,
            smsAcknowledgedAt: true,
            lineNumber: true,
            messagingRegistration: { select: { status: true } },
          },
        },
      },
    }),
    // Scoped by company as well, so a foreign id can't read a thread even
    // before the contact check answers.
    prisma.portalMessage.findMany({
      where: { contactId, companyId: actor.companyId },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: { sender: { select: { name: true } }, media: { select: { id: true, contentType: true, sizeBytes: true } } },
    }),
  ]);
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

  // Opening the thread is the read receipt — but only write when something
  // is actually unread (the page re-renders on every refresh).
  if (messages.some((m) => m.direction === "INBOUND" && !m.readByTeamAt)) {
    await prisma.portalMessage.updateMany({
      where: { contactId: contact.id, direction: "INBOUND", readByTeamAt: null },
      data: { readByTeamAt: new Date() },
    });
  }

  const name = `${contact.firstName} ${contact.lastName}`.trim();

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col lg:p-6">
      <TeamThread
        contactId={contact.id}
        contactName={name}
        contactFirstName={contact.placeholder ? "them" : contact.firstName}
        companyName={contact.companyName}
        phone={contact.phone}
        tz={contact.company.timezone ?? "America/Chicago"}
        channel={channel}
        // A thread started with a typed-in number: name them before (or after) the first text
        banner={
          contact.placeholder ? (
            <SaveContactCard contactId={contact.id} phone={contact.phone ? fmtPhone(contact.phone) : name} />
          ) : null
        }
        initialMessages={messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          via: m.via,
          createdAt: m.createdAt.toISOString(),
          senderName: m.sender?.name ?? null,
          media: threadMedia(m.media, "team"),
        }))}
      />
    </div>
  );
}
