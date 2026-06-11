import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import InvoiceEditor from "./InvoiceEditor";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { jobId } = await searchParams;

  const [contacts, workItems, job] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    jobId
      ? prisma.job.findFirst({
          where: { id: jobId, companyId },
          include: {
            contact: true,
            lineItems: { orderBy: { sortOrder: "asc" } },
            quote: { include: { lineItems: true } },
          },
        })
      : null,
  ]);

  return (
    <InvoiceEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefillJob={job ? JSON.parse(JSON.stringify(job)) : null}
    />
  );
}
