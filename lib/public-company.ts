import { prisma } from "@/lib/db";

/**
 * The public-company gate every customer-facing booking surface shares:
 * suspended companies and pre-approval (payments gate) companies vanish
 * from /book, /embed, the slot APIs and every submit POST.
 */
export async function resolvePublicCompany(companySlug: string) {
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) return null;
  if (company.suspendedAt) return null;
  const { paymentsGateStatus } = await import("@/lib/payments-gate");
  const gate = paymentsGateStatus(company);
  if (gate === "activate" || gate === "pending" || gate === "rejected") return null;
  return company;
}

export type PublicCompany = NonNullable<Awaited<ReturnType<typeof resolvePublicCompany>>>;
