import Link from "next/link";
import { MessageSquare, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import { shortDate } from "@/lib/statuses";

/**
 * Client messages inbox: one row per conversation (contact), newest activity
 * first, unread counts from messages the team hasn't opened. Clients write
 * from their hub's Messages tab — or, once Telnyx is live, by replying to a
 * text — and everything lands here.
 */
export default async function MessagesInboxPage() {
  const actor = await requirePageActor((a) => canSell(a.role));

  const [latest, unread, company] = await Promise.all([
    // Latest message per contact = the conversation list
    prisma.portalMessage.findMany({
      where: { companyId: actor.companyId, ...viaContactScope(actor) },
      orderBy: { createdAt: "desc" },
      distinct: ["contactId"],
      take: 100,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, companyName: true } },
        sender: { select: { name: true } },
      },
    }),
    prisma.portalMessage.groupBy({
      by: ["contactId"],
      where: { companyId: actor.companyId, direction: "INBOUND", readByTeamAt: null },
      _count: { _all: true },
    }),
    // Dates render in the company's zone — the server clock is UTC.
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }),
  ]);
  const tz = company?.timezone ?? "America/Chicago";
  const unreadByContact = new Map(unread.map((u) => [u.contactId, u._count._all]));

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <PageTitle section="chat" icon={MessageSquare}>
        Messages
      </PageTitle>

      {latest.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            art="contacts"
            showPlusIcon={false}
            title="No client messages yet"
            body="Clients can message you from the Messages tab in their portal — replies you send land back there (and mirror to text once SMS is on)."
          />
        </div>
      ) : (
        <div className="space-y-2 mt-6">
          {latest.map((m) => {
            const name = `${m.contact.firstName} ${m.contact.lastName}`.trim();
            const unreadCount = unreadByContact.get(m.contactId) ?? 0;
            const preview =
              m.direction === "OUTBOUND"
                ? `${m.sender?.name ? m.sender.name.split(" ")[0] : "You"}: ${m.body}`
                : m.body;
            return (
              <Link
                key={m.contactId}
                href={`/app/messages/thread/${m.contactId}`}
                className="ds-card flex items-center gap-3.5 p-4"
              >
                <Monogram name={name} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm truncate ${
                        unreadCount ? "font-bold text-gray-900" : "font-semibold text-gray-800"
                      }`}
                    >
                      {name}
                      {m.contact.companyName ? (
                        <span className="font-normal text-gray-500"> · {m.contact.companyName}</span>
                      ) : null}
                    </p>
                    <span className="ml-auto shrink-0 text-xs text-gray-500">
                      {shortDate(m.createdAt, tz)}
                    </span>
                  </div>
                  <p
                    className={`text-[13px] truncate mt-0.5 ${
                      unreadCount ? "text-gray-800 font-medium" : "text-gray-500"
                    }`}
                  >
                    {preview}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)] text-[11px] font-bold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                <ChevronRight size={15} className="text-gray-300 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
