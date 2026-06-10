import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import HubRequestForm from "./HubRequestForm";

export default async function HubNewRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: { hubToken: true },
  });
  if (!contact) notFound();

  return <HubRequestForm token={token} />;
}
