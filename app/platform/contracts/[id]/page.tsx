import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
import { shortDate, quoteStatusLabel } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import ViewedFact from "@/components/ViewedFact";
import ContractActions from "./ContractActions";

export const metadata: Metadata = { title: "Agreement" };

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      quote: { select: { id: true, quoteNumber: true, status: true } },
    },
  });
  if (!contract) notFound();

  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: actor.companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const signUrl = `${baseUrl}/contract/${contract.publicToken}`;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link
          prefetch={false} href="/app/contracts"
          className="hidden lg:block text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="contract" status={contract.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">{contract.title}</h1>
          <Link
            prefetch={false} href={`/app/contacts/${contract.contactId}`}
            className="text-sm text-green-700 hover:underline"
          >
            {contract.contact.firstName} {contract.contact.lastName}
          </Link>
        </div>
        <ContractActions
          contractId={contract.id}
          status={contract.status}
          signUrl={signUrl}
          canDelete={isManager(actor.role)}
          title={contract.title}
          body={contract.body}
          contactEmail={contract.contact.email}
        />
      </div>

      {(contract.sentAt || contract.firstViewedAt || contract.quote) && (
        <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 card-ledger mb-6 text-sm">
          {contract.sentAt && (
            <div>
              <span className="text-xs font-medium text-gray-500 block">Sent</span>
              <span className="text-gray-800">{shortDate(contract.sentAt, tz)}</span>
            </div>
          )}
          {contract.quote && (
            <div>
              <span className="text-xs font-medium text-gray-500 block">From quote</span>
              <Link
                prefetch={false}
                href={`/app/quotes/${contract.quote.id}`}
                className="text-green-700 hover:underline"
              >
                Quote #{contract.quote.quoteNumber} ({quoteStatusLabel[contract.quote.status]})
              </Link>
            </div>
          )}
          <ViewedFact
            firstViewedAt={contract.firstViewedAt}
            lastViewedAt={contract.lastViewedAt}
            viewCount={contract.viewCount}
            sent={!!contract.sentAt || contract.status !== "DRAFT"}
            tz={tz}
          />
        </div>
      )}

      {contract.status === "SIGNED" && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Signed by <span className="font-semibold">{contract.signatureName}</span>
          {contract.signedAt &&
            ` on ${contract.signedAt.toLocaleString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: tz,
            })}`}
          {contract.signedFromIp && ` · IP ${contract.signedFromIp}`}
        </div>
      )}

      <div className="card-ledger px-6 py-5">
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{contract.body}</p>
      </div>
    </div>
  );
}
