import { companyBySlug } from "@/lib/company-slug";

/**
 * The public-company gate every customer-facing booking surface shares:
 * suspended companies and pre-approval (payments gate) companies vanish
 * from /book, /embed, the slot APIs and every submit POST. An earlier web
 * address (Company.previousSlugs) resolves too — see lib/company-slug.ts.
 */
export async function resolvePublicCompany(companySlug: string) {
  const company = await companyBySlug(companySlug);
  if (!company) return null;
  if (company.suspendedAt) return null;
  const { paymentsGateStatus } = await import("@/lib/payments-gate");
  const gate = paymentsGateStatus(company);
  if (gate === "activate" || gate === "pending" || gate === "rejected") return null;
  return company;
}

export type PublicCompany = NonNullable<Awaited<ReturnType<typeof resolvePublicCompany>>>;
