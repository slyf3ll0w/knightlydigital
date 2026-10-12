import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
import { isContractLinkExpired } from "@/lib/agreements";
import ViewBeacon from "@/components/ViewBeacon";
import ContractSignPage from "./ContractSignPage";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contract = await prisma.contract.findUnique({
    where: { publicToken: token },
    select: { title: true, company: { select: { name: true, logoUrl: true } } },
  });
  return companyMeta(contract?.company, contract?.title);
}

export default async function PublicContractPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contract = await prisma.contract.findUnique({
    where: { publicToken: token },
    include: { contact: true, company: true },
  });
  // A voided agreement keeps its page: the client is told it was withdrawn
  // instead of meeting a bare 404 (audit 2026-10-12). The body is not shown.
  if (!contract) notFound();

  return (
    <>
      <ViewBeacon kind="contract" token={token} />
      <ContractSignPage
      token={token}
      title={contract.title}
      body={contract.status === "VOID" ? "" : contract.body}
      status={contract.status}
      expired={isContractLinkExpired(contract)}
      signatureName={contract.signatureName}
      signedAt={contract.signedAt?.toISOString() ?? null}
      contactName={`${contract.contact.firstName} ${contract.contact.lastName}`.trim()}
      companyName={contract.company.name}
      legalName={contract.company.showLegalNameOnDocs ? contract.company.legalName : null}
      companyLogoUrl={contract.company.logoUrl}
      brandColor={contract.company.brandColorSecondary ?? contract.company.brandColor}
      />
    </>
  );
}
