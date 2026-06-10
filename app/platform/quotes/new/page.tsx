import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import QuoteEditor from "../[id]/QuoteEditor";

export default async function NewQuotePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const contacts = await prisma.contact.findMany({
    where: { companyId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return <QuoteEditor contacts={contacts} />;
}
