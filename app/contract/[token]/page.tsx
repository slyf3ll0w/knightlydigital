import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { companyMeta } from "@/lib/client-meta";
import { isContractLinkExpired } from "@/lib/agreements";
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
  if (!contract || contract.status === "VOID") notFound();

  return (
    <ContractSignPage
      token={token}
      title={contract.title}
      body={contract.body}
      status={contract.status}
      expired={isContractLinkExpired(contract)}
      signatureName={contract.signatureName}
      signedAt={contract.signedAt?.toISOString() ?? null}
      contactName={`${contract.contact.firstName} ${contract.contact.lastName}`.trim()}
      companyName={contract.company.name}
      companyLogoUrl={contract.company.logoUrl}
      brandColor={contract.company.brandColor}
    />
  );
}
