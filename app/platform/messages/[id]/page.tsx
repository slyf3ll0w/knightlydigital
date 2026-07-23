import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import { shortDate, clientMessageStatus } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import ViewedFact from "@/components/ViewedFact";

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

  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  const publicUrl = `${baseUrl}/message/${message.publicToken}`;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href={`/app/contacts/${message.contact.id}`}
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="message" status={clientMessageStatus(message)} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">
            {message.subject}
          </h1>
          <Link
            href={`/app/contacts/${message.contact.id}`}
            className="text-sm text-green-700 hover:underline"
          >
            {message.contact.firstName} {message.contact.lastName}
          </Link>
        </div>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
        >
          <ExternalLink size={14} />
          View client page
        </a>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 card-ledger mb-6 text-sm">
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Sent</span>
          <span className="text-gray-800">{shortDate(message.createdAt)}</span>
        </div>
        {message.contact.email && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">To</span>
            <span className="text-gray-800">{message.contact.email}</span>
          </div>
        )}
        {message.sender && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">Sent by</span>
            <span className="text-gray-800">{message.sender.name}</span>
          </div>
        )}
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Email opened</span>
          {message.emailOpenedAt ? (
            message.emailOpenKind === "confident" ? (
              <span className="font-medium text-green-700">{shortDate(message.emailOpenedAt)}</span>
            ) : (
              <span
                className="font-medium text-blue-700"
                title="Their mail app auto-loaded the email's images (Apple Mail privacy proxy) — this usually means an open, but Apple makes prefetches look identical, so it isn't certain."
              >
                {shortDate(message.emailOpenedAt)} · likely
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
        />
      </div>

      <div className="card-ledger px-6 py-5">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {message.body}
        </p>
        {message.signature && (
          <p className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
            {message.signature}
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Replies to this email go to your business inbox, not into WorkBench.
      </p>
    </div>
  );
}
