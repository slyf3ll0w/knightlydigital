import { prisma } from "@/lib/db";
import Link from "next/link";
import { ChevronRight, FileSignature } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import ViewedFact from "@/components/ViewedFact";
import Monogram from "@/components/Monogram";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";

/**
 * Issued agreements finally get an index — they were only reachable through a
 * contact page. Awaiting-signature first (that's the actionable pile), then
 * everything else.
 */
export default async function ContractsPage() {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const contracts = await prisma.contract.findMany({
    where: { companyId, ...viaContactScope(actor) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });

  const pending = contracts.filter((c) => c.status === "SENT");
  const rest = contracts.filter((c) => c.status !== "SENT");

  const section = (title: string, list: typeof contracts) =>
    list.length > 0 && (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
        <div className="card-ledger overflow-hidden divide-y divide-gray-100">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/app/contracts/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <Monogram name={`${c.contact.firstName} ${c.contact.lastName}`} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {c.title}
                  {c.contractNumber ? (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      #{c.contractNumber}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-gray-500 mt-0.5">
                  {c.contact.firstName} {c.contact.lastName}
                  {c.sentAt ? ` · Sent ${shortDate(c.sentAt)}` : ` · Created ${shortDate(c.createdAt)}`}
                  {c.signedAt ? ` · Signed ${shortDate(c.signedAt)}` : ""}
                </p>
              </div>
              <StatusChip kind="contract" status={c.status} className="shrink-0" />
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    );

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle section="contracts" icon={FileSignature}>
          Agreements
        </PageTitle>
      </div>

      {contracts.length === 0 ? (
        <div className="card-ledger py-14 text-center">
          <FileSignature size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 mb-1">No agreements yet</p>
          <p className="text-sm text-gray-500">
            Send one from a client&apos;s page, or attach an agreement template to a
            price-book service and it goes out with the quote.
          </p>
        </div>
      ) : (
        <>
          {section("Awaiting signature", pending)}
          {section("All agreements", rest)}
        </>
      )}
    </div>
  );
}
