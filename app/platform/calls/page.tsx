import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager } from "@/lib/permissions";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import CallRow from "@/components/CallRow";
import { markCallsSeen } from "@/lib/voice";
import DialFromApp from "@/components/DialFromApp";

/**
 * Calls on the business line (lib/voice.ts): every inbound call — answered,
 * missed, or a voicemail to play right here — and every call placed from
 * the app. Opening the page marks finished calls as seen (bold rows are
 * the missed calls and voicemails nobody has looked at yet).
 */
export default async function CallsPage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const { contact: contactId } = await searchParams;

  const [company, calls] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { lineNumber: true, lineVoiceAppAt: true },
    }),
    prisma.call.findMany({
      where: { companyId: actor.companyId, ...(contactId ? { contactId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        direction: true,
        status: true,
        customerNumber: true,
        durationSec: true,
        voicemailSec: true,
        voicemailRecordingId: true,
        seenAt: true,
        createdAt: true,
        contact: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { name: true } },
        via: true,
        answeredBy: { select: { name: true } },
      },
    }),
  ]);
  await markCallsSeen(actor.companyId).catch(() => {});

  const hasLine = Boolean(company?.lineNumber && !company.lineNumber.startsWith("pending:"));
  const filteredContact = contactId ? calls.find((c) => c.contact?.id === contactId)?.contact : null;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <PageTitle section="chat" icon={PhoneCall}>
        Calls
      </PageTitle>
      {hasLine && company?.lineVoiceAppAt && <DialFromApp manager={isManager(actor.role)} />}
      {filteredContact && (
        <p className="mt-2 text-sm text-gray-500">
          Calls with{" "}
          <Link href={`/app/contacts/${filteredContact.id}`} className="font-medium text-gray-800 hover:underline">
            {filteredContact.firstName} {filteredContact.lastName}
          </Link>{" "}
          ·{" "}
          <Link href="/app/calls" className="underline">
            all calls
          </Link>
        </p>
      )}

      {calls.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            art="contacts"
            hue="var(--sh-chat)"
            showPlusIcon={false}
            title={hasLine ? "No calls yet" : "No business line yet"}
            body={
              hasLine
                ? company?.lineVoiceAppAt
                  ? "Calls to your business line show up here as they happen — answered, missed, or with the voicemail ready to play."
                  : "Your line is still on plain forwarding. Save your ring-through number again in Settings → Features to turn on call announcements and voicemail."
                : isManager(actor.role)
                  ? "Get a business line in Settings → Features: a number of your own that rings your cell, announces who's calling, and takes voicemail."
                  : "Ask an owner to set up a business line in Settings → Features."
            }
          />
          {isManager(actor.role) && (
            <p className="mt-4 text-center">
              <Link href="/app/settings?s=features" className="text-sm font-medium underline text-gray-700">
                Open Settings → Features
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 mt-6">
          {calls.map((c) => (
            <CallRow key={c.id} call={c} />
          ))}
        </div>
      )}
    </div>
  );
}
