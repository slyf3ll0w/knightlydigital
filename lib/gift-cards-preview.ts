import { prisma } from "@/lib/db";

/**
 * Gift cards are SUSPENDED for live accounts (David 2026-11-02: "I don't
 * know if we'll have it on the live product"). Everything built for them —
 * the Gift cards screen, Sell, Redeem on an invoice, the pay page's Gift
 * card method, the client-page card, the API routes — shows and works ONLY
 * for test accounts (Company.isTest), the same switch the Gallery preview
 * uses (lib/gallery-preview.ts). `GIFT_CARDS_OPEN=1` on Railway opens it to
 * everyone again without a deploy. The data model, the webhook unwind and
 * the hourly activation sweep stay as they are (no-ops without sales).
 */
export function giftCardsOpen(
  company: { isTest?: boolean | null },
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.GIFT_CARDS_OPEN === "1") return true;
  return Boolean(company.isTest);
}

export async function giftCardsOpenFor(companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isTest: true } });
  return company ? giftCardsOpen(company) : false;
}

export const GIFT_CARDS_CLOSED_MESSAGE = "Gift cards aren't available on this account yet.";
