import type { Metadata } from "next";
import { prisma } from "@/lib/db";

/**
 * Client-facing pages (booking forms, hub, quotes, invoices, contracts)
 * belong to the company, not to Streamflaire — tab title is the company
 * name and the favicon is their uploaded logo when they have one.
 */
export function companyMeta(
  company: { name: string; logoUrl: string | null } | null | undefined,
  suffix?: string
): Metadata {
  if (!company) return {};
  return {
    title: { absolute: suffix ? `${company.name} — ${suffix}` : company.name },
    ...(company.logoUrl ? { icons: { icon: company.logoUrl } } : {}),
  };
}

/** Company lookup for generateMetadata on slug-based public pages. */
export async function companyMetaBySlug(slug: string, suffix?: string): Promise<Metadata> {
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { name: true, logoUrl: true },
  });
  return companyMeta(company, suffix);
}
