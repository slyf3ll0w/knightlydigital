import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import QuoteEditor from "../[id]/QuoteEditor";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; requestId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { contactId, requestId } = await searchParams;

  const [contacts, workItems, request] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    requestId
      ? prisma.request.findFirst({ where: { id: requestId, companyId } })
      : Promise.resolve(null),
  ]);

  return (
    <QuoteEditor
      contacts={contacts}
      workItems={JSON.parse(JSON.stringify(workItems))}
      prefilledContactId={request?.contactId ?? contactId ?? ""}
      requestId={request?.id ?? ""}
      requestTitle={request?.title ?? ""}
    />
  );
}
