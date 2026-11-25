import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import { shortDate, clientMessageStatus } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import ViewedFact from "@/components/ViewedFact";
import { DsPage, OpenSection, PageHeader } from "@/components/ds";

/** Sent client email (ClientMessage) — the team-side record with open status. */
export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { id } = await params;
  const message = await prisma.clientMessage.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      sender: { select: { name: true } },
    },
  });
  if (!message) notFound();

  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  const publicUrl = `${baseUrl}/message/${message.publicToken}`;

  const facts = (
    <>
    <div>
      <span className="text-xs font-medium text-gray-500 block">Sent</span>
      <span className="text-gray-800">{shortDate(message.createdAt, tz)}</span>
    </div>
    {message.contact.email && (
      <div>
        <span className="text-xs font-medium text-gray-500 block">To</span>
        <span className="text-gray-800">{message.contact.email}</span>
      </div>
    )}
    {message.sender && (
      <div>
        <span className="text-xs font-medium text-gray-500 block">Sent by</span>
        <span className="text-gray-800">{message.sender.name}</span>
      </div>
    )}
    <div>
      <span className="text-xs font-medium text-gray-500 block">Email opened</span>
      {message.emailOpenedAt ? (
        message.emailOpenKind === "confident" ? (
          <span className="font-medium text-[color:var(--ds-good)]">{shortDate(message.emailOpenedAt, tz)}</span>
        ) : (
          <span
            className="font-medium text-[color:var(--ds-primary)]"
            title="Their mail app auto-loaded the email's images (Apple Mail privacy proxy) — this usually means an open, but Apple makes prefetches look identical, so it isn't certain."
          >
            {shortDate(message.emailOpenedAt, tz)} · likely
          </span>
        )
      ) : (
        <span className="text-gray-400">Not opened yet</span>
      )}
    </div>
    <ViewedFact
      firstViewedAt={message.firstViewedAt}
      lastViewedAt={message.lastViewedAt}
      viewCount={message.viewCount}
      sent
      label="Viewed online"
      tz={tz}
    />
    </>
  );
  const body = (
    <>
    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
      {message.body}
    </p>
    {message.signature && (
      <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
        {message.signature}
      </p>
    )}
    </>
  );
  const clientName = `${message.contact.firstName} ${message.contact.lastName}`.trim();
  const viewLink = (
    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn-outline">
      <ExternalLink size={15} />
      View client page
    </a>
  );

  return (
      <DsPage
        open
        className="lg:max-w-4xl ml-page"
        header={
          <PageHeader
            eyebrow={
              <span className="flex items-center gap-2">
                <Link prefetch={false} href="/app/messages" className="hover:text-[color:var(--ds-ink)]">
                  Messages
                </Link>
                <span aria-hidden>/</span>
                <span>Email to {clientName || "client"}</span>
              </span>
            }
            title={
              <span className="flex flex-wrap items-center gap-3">
                <span>{message.subject}</span>
                <StatusChip kind="message" status={clientMessageStatus(message)} />
              </span>
            }
            actions={
              <>
                <Link prefetch={false} href={`/app/contacts/${message.contact.id}`} className="ds-btn ds-btn-outline">
                  {clientName || "Client"}
                </Link>
                {viewLink}
              </>
            }
          />
        }
      >
        <div className="tl-facts">{facts}</div>
        <OpenSection title="Message" className="mt-10">
          <div className="tl-msg-body">{body}</div>
        </OpenSection>
        <p className="mt-4 text-xs text-[color:var(--ds-muted)]">Replies to this email go to your business inbox, not into WorkBench.</p>
      </DsPage>
  );
}