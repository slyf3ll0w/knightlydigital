import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ContractSignPage from "./ContractSignPage";

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
      signatureName={contract.signatureName}
      signedAt={contract.signedAt?.toISOString() ?? null}
      contactName={`${contract.contact.firstName} ${contract.contact.lastName}`.trim()}
      companyName={contract.company.name}
      companyLogoUrl={contract.company.logoUrl}
      brandColor={contract.company.brandColor}
    />
  );
}
