/**
 * What happens AFTER a quote flips to APPROVED — shared by the client's
 * public sign-off and the office's "Mark Approved", so a verbal approval
 * recorded internally mints the same deposit invoice, issues the same
 * on-approval agreements and moves the same pipeline card as the client
 * signing online would. (Before this, the internal path skipped all of it.)
 */

import { prisma } from "@/lib/db";
import { canChargeOnline } from "@/lib/payments-gate";
import { autoSendQuoteAgreements } from "@/lib/agreements";
import { createDepositInvoice, type DepositInvoiceResult } from "@/lib/deposits";
import { sendEmail, invoiceLinkEmail } from "@/lib/email";
import { recordLeadWin } from "@/lib/pipeline";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { logActivity } from "@/lib/activity";

/** Quote statuses from which approval is a meaningful transition. */
export const APPROVABLE_STATUSES = ["AWAITING_RESPONSE", "CHANGES_REQUESTED"] as const;

export type ApprovalOutcome = {
  deposit: DepositInvoiceResult | null;
  /** true = pay link emailed; false = a deposit is owed but the email failed
   *  (no key / company blocked / provider error); null = nothing to email. */
  emailed: boolean | null;
};

export async function finishQuoteApproval(
  quoteId: string,
  actor?: { id: string; name: string } | null
): Promise<ApprovalOutcome> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { contact: true, company: true },
  });
  if (!quote) return { deposit: null, emailed: null };

  // Deposit invoice (idempotent; re-priced if one was minted earlier).
  // Retried from out here because it derives an invoice number.
  const deposit = await withDocNumberRetry(() =>
    prisma.$transaction((tx) =>
      createDepositInvoice(tx, {
        id: quote.id,
        companyId: quote.companyId,
        contactId: quote.contactId,
        quoteNumber: quote.quoteNumber,
        total: Number(quote.total),
        depositType: quote.depositType,
        depositValue: quote.depositValue == null ? null : Number(quote.depositValue),
      })
    )
  );

  // Approval issues any attached agreements set to "on approval"
  await autoSendQuoteAgreements(quote.id, "ON_APPROVAL");

  // Pipeline board: an approved quote converts the lead — their card lands in
  // the Converted section and they become an active client
  const boardContact = await prisma.contact.findUnique({
    where: { id: quote.contactId },
    select: { id: true, status: true, pipelineStageId: true },
  });
  if (boardContact) {
    await recordLeadWin(prisma, quote.companyId, boardContact);
  }

  // Email the client the deposit pay link whenever a deposit is still owed —
  // just minted, or minted earlier by "Collect deposit" (possibly re-priced
  // by an edit since). Approval is the moment they expect to be asked.
  let emailed: boolean | null = null;
  if (deposit && deposit.outstanding > 0 && quote.contact.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
    const { subject, html } = invoiceLinkEmail({
      brand: quote.company,
      companyName: quote.company.name,
      invoiceNumber: deposit.invoice.invoiceNumber,
      total: deposit.amount,
      payUrl: `${baseUrl}/pay/${deposit.invoice.publicToken}`,
      payable: canChargeOnline(quote.company),
      serviceNames: [`Deposit for Quote #${quote.quoteNumber}`],
    });
    emailed = await sendEmail({
      companyId: quote.companyId,
      to: quote.contact.email,
      subject,
      html,
      replyTo: quote.company.email || undefined,
      fromName: quote.company.name,
    });
    if (!emailed) {
      // The route reports success (the approval DID land) — leave a trace
      // the office can see so the pay link gets sent by hand.
      logActivity({
        companyId: quote.companyId,
        userId: actor?.id ?? null,
        userName: actor?.name ?? "System",
        entityType: "invoice",
        entityId: deposit.invoice.id,
        action: "email_failed",
        detail: `Deposit pay link for Quote #${quote.quoteNumber} could not be emailed — send it from the invoice.`,
      });
    }
  }

  return { deposit, emailed };
}
