import { MessageSquare } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import { hasPlan } from "@/lib/plans";
import VoicePlanNote from "@/components/VoicePlanNote";
import PageTitle from "@/components/PageTitle";
import { loadInbox } from "@/lib/inbox";
import NewMessageButton from "./NewMessageButton";
import InboxList from "./InboxList";

/**
 * Client messages inbox: one row per conversation (contact), newest activity
 * first, unread counts from messages the team hasn't opened. Clients write
 * from their hub's Messages tab — or, once Telnyx is live, by replying to a
 * text — and everything lands here. The rows come from lib/inbox.ts and the
 * list keeps itself current in place (InboxList).
 */
export default async function MessagesInboxPage() {
  const actor = await requirePageActor((a) => canSell(a.role));

  const [rows, company] = await Promise.all([
    loadInbox(actor),
    // Dates render in the company's zone — the server clock is UTC. The line
    // decides whether New message may start a thread with a typed number.
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { timezone: true, lineNumber: true, planGrants: true, addonActiveAt: true },
    }),
  ]);
  const tz = company?.timezone ?? "America/Chicago";
  const hasLine = Boolean(company?.lineNumber && !company.lineNumber.startsWith("pending:"));
  const onVoicePlan = company ? hasPlan(company, "DISPATCH") : false;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <PageTitle section="chat" icon={MessageSquare}>
          Messages
        </PageTitle>
        <NewMessageButton hasLine={hasLine} />
      </div>
      {!onVoicePlan && <VoicePlanNote what="texts" manager={isManager(actor.role)} />}
      <InboxList initial={rows} tz={tz} />
    </div>
  );
}
