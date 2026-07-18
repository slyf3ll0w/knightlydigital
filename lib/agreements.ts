/**
 * Agreement auto-send for recurring/contract services.
 *
 * A price-book service can have a ContractTemplate attached with a timing of
 * WITH_QUOTE (send the moment the quote goes out) or ON_APPROVAL (send once the
 * client approves). When a quote contains such a service, these helpers create
 * and send the Contract automatically — mirroring app/api/app/contracts POST —
 * so staff don't have to remember to issue it. The existing convert gate
 * (quotes/[id]/convert) still blocks job creation until it's signed.
 */

import type { AgreementTiming } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail, contractSignEmail } from "@/lib/email";

/**
 * How long a contract signing link stays valid after it's sent. Links are
 * unguessable tokens, but expiring them limits the window in which a stale or
 * forwarded link can be used. Resending from the hub refreshes the clock by
 * bumping `sentAt`.
 */
export const CONTRACT_LINK_TTL_DAYS = 30;

/**
 * True when an unsigned contract's signing link has passed its TTL. Already
 * SIGNED contracts never expire — the signer keeps a permanent record. Window
 * is measured from `sentAt`, falling back to `createdAt` for links that predate
 * a send timestamp.
 */
export function isContractLinkExpired(contract: {
  status: string;
  sentAt: Date | null;
  createdAt: Date;
}): boolean {
  if (contract.status === "SIGNED") return false;
  const start = contract.sentAt ?? contract.createdAt;
  const expiresAt = start.getTime() + CONTRACT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() > expiresAt;
}

/**
 * Create + send any attached agreements for a quote whose timing matches.
 * Idempotent: skips a template that already has a contract on this quote.
 * Best-effort — never throws into the caller's request path.
 */
export async function autoSendQuoteAgreements(
  quoteId: string,
  timing: AgreementTiming
): Promise<void> {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: { lineItems: true, contact: true, contracts: { select: { templateId: true } } },
    });
    if (!quote) return;

    // WorkItems referenced by this quote's lines that carry a matching template
    const workItemIds = Array.from(
      new Set(quote.lineItems.map((li) => li.workItemId).filter((id): id is string => !!id))
    );
    if (workItemIds.length === 0) return;

    const items = await prisma.workItem.findMany({
      where: {
        id: { in: workItemIds },
        companyId: quote.companyId,
        agreementTemplateId: { not: null },
        agreementTiming: timing,
      },
      include: { agreementTemplate: true },
    });
    if (items.length === 0) return;

    const company = await prisma.company.findUnique({
      where: { id: quote.companyId },
      select: { name: true, brandColor: true, brandColorSecondary: true, logoUrl: true },
    });
    const today = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // One contract per distinct template, skipping ones already on the quote
    const seen = new Set(quote.contracts.map((c) => c.templateId).filter(Boolean) as string[]);
    const templates = new Map<string, NonNullable<(typeof items)[number]["agreementTemplate"]>>();
    for (const item of items) {
      if (item.agreementTemplate && !seen.has(item.agreementTemplate.id)) {
        templates.set(item.agreementTemplate.id, item.agreementTemplate);
      }
    }

    for (const template of templates.values()) {
      const body = template.body
        .replaceAll("{{client_name}}", `${quote.contact.firstName} ${quote.contact.lastName}`.trim())
        .replaceAll("{{company_name}}", company?.name ?? "")
        .replaceAll("{{date}}", today);

      const contract = await prisma.contract.create({
        data: {
          companyId: quote.companyId,
          contactId: quote.contactId,
          templateId: template.id,
          quoteId: quote.id,
          title: template.name,
          body,
          status: "SENT",
          sentAt: new Date(),
        },
      });

      if (quote.contact.email) {
        const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
        const { subject, html } = contractSignEmail({
          companyName: company?.name ?? "",
          contactFirstName: quote.contact.firstName,
          title: template.name,
          signUrl: `${baseUrl}/contract/${contract.publicToken}`,
        });
        await sendEmail({
          to: quote.contact.email,
          subject,
          html,
          fromName: company?.name,
          brand: company,
        });
      }
    }
  } catch (err) {
    console.error("[agreements] auto-send failed for quote", quoteId, err);
  }
}
