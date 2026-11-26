import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { money, shortDate } from "@/lib/statuses";
import { HubEmpty, HubGroup, HubPageHead, HubRow, type HubTone } from "../HubKit";

// Client-facing statuses — friendlier words than the internal ones, as a dot + word
const clientQuoteStatus: Record<string, { label: string; tone: HubTone }> = {
  AWAITING_RESPONSE: { label: "Needs your approval", tone: "warn" },
  APPROVED: { label: "Approved", tone: "good" },
  CONVERTED: { label: "Approved", tone: "good" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "info" },
};

export default async function HubQuotesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    include: {
      quotes: {
        // Drafts and archived quotes stay internal
        where: { status: { in: ["AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "CONVERTED"] } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!contact) notFound();

  const waiting = contact.quotes.filter((q) => q.status === "AWAITING_RESPONSE").length;
  return (
    <div>
      <HubPageHead
        title="Quotes"
        note={
          contact.quotes.length === 0
            ? "Quotes we send you show up here."
            : waiting > 0
              ? `${waiting} waiting for your approval`
              : "Nothing waiting for your approval"
        }
      />
      {contact.quotes.length === 0 ? (
        <HubEmpty title="No quotes yet" body="When we send you a quote, it shows up here to review and approve." />
      ) : (
        <HubGroup flush>
          {contact.quotes.map((q) => (
            <HubRow
              key={q.id}
              href={`/quote/${q.publicToken}`}
              title={q.title || `Quote #${q.quoteNumber}`}
              sub={`#${q.quoteNumber} · ${shortDate(q.createdAt)}`}
              value={money(q.total)}
              status={clientQuoteStatus[q.status] ?? null}
            />
          ))}
        </HubGroup>
      )}
    </div>
  );
}
