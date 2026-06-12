import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, isManager, viaContactScope } from "@/lib/permissions";
import StatusChip from "@/components/StatusChip";
import ContractActions from "./ContractActions";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
    include: { contact: true },
  });
  if (!contract) notFound();

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const signUrl = `${baseUrl}/contract/${contract.publicToken}`;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href={`/app/contacts/${contract.contactId}`}
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="contract" status={contract.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
          <Link
            href={`/app/contacts/${contract.contactId}`}
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
        />
      </div>

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
            })}`}
          {contract.signedFromIp && ` · IP ${contract.signedFromIp}`}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg px-6 py-5">
        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{contract.body}</p>
      </div>
    </div>
  );
}
