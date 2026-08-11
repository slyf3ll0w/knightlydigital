import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope } from "@/lib/permissions";
import QuoteEditor from "../[id]/QuoteEditor";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; requestId?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { contactId, requestId } = await searchParams;

  const [contacts, workItems, company, request] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, ...contactScope(actor), status: { in: ["LEAD", "ACTIVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { addresses: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultTaxRate: true },
    }),
    requestId
      ? prisma.request.findFirst({
          where: { id: requestId, companyId, contact: contactScope(actor) },
        })
      : Promise.resolve(null),
  ]);

  const defaultTaxRatePercent = company?.defaultTaxRate
    ? String(Math.round(Number(company.defaultTaxRate) * 100000) / 1000)
    : "";

  return (
    <QuoteEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefilledContactId={request?.contactId ?? contactId ?? ""}
      requestId={request?.id ?? ""}
      requestTitle={request?.title ?? ""}
      defaultTaxRatePercent={defaultTaxRatePercent}
    />
  );
}
