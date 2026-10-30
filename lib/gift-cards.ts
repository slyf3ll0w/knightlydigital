import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { logActivity } from "@/lib/activity";
import { nextInvoiceNumber, withDocNumberRetry } from "@/lib/doc-numbers";
import { dueDateFromTerms } from "@/lib/due-dates";
import { acquireChargeLock, getProcessor, invoiceBalance, recordPayment, releaseChargeLock } from "@/lib/payments";
import { createSquarePayment, SquareError, declineMessage } from "@/lib/square";
import { squareTokenForCompany } from "@/lib/square-connection";
import { sendEmail, giftCardEmail } from "@/lib/email";
import {
  createSquareGiftCard,
  deactivateSquareGiftCard,
  linkSquareGiftCardToCustomer,
  listSquareGiftCards,
  loadSquareGiftCard,
  normalizeGan,
  retrieveSquareGiftCard,
  retrieveSquareGiftCardByGan,
  ganTail,
  type SellerGiftCard,
} from "@/lib/square-products";
import type { SellerReadFailure } from "@/lib/square-seller-reports";

/**
 * Gift cards sold and redeemed through WorkBench on the seller's own Square
 * account (2026-10-30, docs/plans/square-products-2026-10-30.md).
 *
 * Selling: a DIGITAL Square gift card is created PENDING (no balance) and an
 * ordinary QUICK_CHARGE invoice "Gift card" is issued to the buyer; the
 * `GiftCardSale` row ties them. The buyer pays the invoice any way an
 * invoice is paid. When it is PAID, `activateGiftCardForInvoice` (called by
 * recordPayment) ACTIVATES the card for the amount — Square wants to know
 * what paid for it: the Square payment id when the money went through
 * Square, else our own payment id — and emails the recipient the number.
 * A refused activation is marked FAILED and retried by the hourly cron
 * (`runGiftCardActivationSweep`) up to MAX_ACTIVATION_ATTEMPTS.
 *
 * Redeeming: the card pays an invoice — CreatePayment with the gift card id
 * as `source_id` (Square writes the REDEEM activity and moves the balance),
 * recorded as a `GIFT_CARD` payment with the Square payment id as its
 * processorRef, so the existing refund route puts money back on the card.
 * No card surcharge on gift-card payments (nothing is processed).
 */

export const GIFT_CARD_MIN_CENTS = 500;
/** Square's own cap on a US gift card balance. */
export const GIFT_CARD_MAX_CENTS = 200_000;
export const MAX_ACTIVATION_ATTEMPTS = 6;

export class GiftCardError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string
  ) {
    super(message);
  }
}

function fromFailure(f: SellerReadFailure): GiftCardError {
  if (f.notConnected) return new GiftCardError("Connect Square in Settings first.", 400, "NOT_CONNECTED");
  if (f.missingScopes) return new GiftCardError("Reconnect Square in Settings → Payments & accounting to use gift cards.", 409, "MISSING_SCOPES");
  if (f.transient) return new GiftCardError("Square didn't answer — try again in a moment.", 424, "SQUARE_DOWN");
  return new GiftCardError(f.message, 424);
}

/** Amount rules for a sale (pure): whole cents, $5–$2,000. */
export function giftCardAmountIssue(amountCents: number): string | null {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return "Enter an amount.";
  if (amountCents < GIFT_CARD_MIN_CENTS) return `Gift cards start at $${GIFT_CARD_MIN_CENTS / 100}.`;
  if (amountCents > GIFT_CARD_MAX_CENTS) return `Square caps a gift card at $${(GIFT_CARD_MAX_CENTS / 100).toLocaleString("en-US")}.`;
  if (Math.round(amountCents) !== amountCents) return "Whole cents only.";
  return null;
}

async function companyForGiftCards(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, email: true, phone: true, logoUrl: true, brandColor: true, documentColor: true, brandColorSecondary: true, squareLocationId: true, squareMerchantId: true, squareConnectedAt: true, suspendedAt: true },
  });
  if (!company) throw new GiftCardError("Company not found.", 404);
  if (company.suspendedAt) throw new GiftCardError("This account is suspended.", 403);
  if (getProcessor().name !== "square" || !company.squareMerchantId || !company.squareLocationId) {
    throw new GiftCardError("Connect Square in Settings → Payments & accounting to sell gift cards.", 400, "NOT_CONNECTED");
  }
  return company as typeof company & { squareLocationId: string };
}

export type GiftCardSaleResult = {
  saleId: string;
  invoiceId: string;
  invoiceNumber: number;
  publicToken: string;
  giftCardId: string;
  gan: string | null;
  amountCents: number;
};

/**
 * Sell a gift card: the Square card (PENDING) + the invoice the buyer pays.
 * The invoice is made first so a Square refusal leaves nothing half-done
 * (it is archived on failure).
 */
export async function sellGiftCard(params: {
  companyId: string;
  actorId: string;
  actorName: string;
  amountCents: number;
  contactId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  message?: string | null;
}): Promise<GiftCardSaleResult> {
  const issue = giftCardAmountIssue(params.amountCents);
  if (issue) throw new GiftCardError(issue);
  const company = await companyForGiftCards(params.companyId);
  const contact = params.contactId
    ? await prisma.contact.findFirst({ where: { id: params.contactId, companyId: params.companyId }, select: { id: true, firstName: true, lastName: true, email: true, squareCustomerId: true } })
    : null;
  if (params.contactId && !contact) throw new GiftCardError("Client not found.", 404);
  const recipientEmail = params.recipientEmail?.trim().toLowerCase() || null;
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new GiftCardError("That email address doesn't look right.");
  if (!recipientEmail && !contact?.email) throw new GiftCardError("Add an email for the recipient, or pick a client with an email — that's where the card number goes once it's paid.");

  const amount = params.amountCents / 100;
  const now = new Date();
  const invoice = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, company.id);
      return tx.invoice.create({
        data: {
          companyId: company.id,
          contactId: contact?.id ?? null,
          publicToken: randomBytes(24).toString("hex"),
          kind: "QUICK_CHARGE",
          invoiceNumber,
          subject: `Gift card · $${amount.toFixed(2)}`,
          status: "AWAITING_PAYMENT",
          subtotal: amount,
          total: amount,
          clientMessage: params.recipientName?.trim() ? `Gift card for ${params.recipientName.trim()}.` : null,
          issuedAt: now,
          dueDate: dueDateFromTerms(now, 0),
          lineItems: { create: [{ name: "Gift card", description: params.recipientName?.trim() ? `For ${params.recipientName.trim()}` : "", quantity: 1, unitPrice: amount, total: amount, sortOrder: 0 }] },
        },
        select: { id: true, invoiceNumber: true, publicToken: true },
      });
    })
  );

  const created = await createSquareGiftCard(company.id, { locationId: company.squareLocationId, idempotencyKey: `gc:${invoice.id}` });
  if (!created.ok) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "ARCHIVED" } }).catch(() => {});
    throw fromFailure(created);
  }
  const card: SellerGiftCard = created.data;
  if (contact?.squareCustomerId) {
    const linked = await linkSquareGiftCardToCustomer(company.id, card.id, contact.squareCustomerId);
    if (!linked.ok && !linked.transient) console.warn(`[gift-cards] link to customer failed for ${card.id}: ${linked.message}`);
  }
  const sale = await prisma.giftCardSale.create({
    data: {
      companyId: company.id,
      contactId: contact?.id ?? null,
      invoiceId: invoice.id,
      squareGiftCardId: card.id,
      gan: card.gan ?? "",
      amountCents: params.amountCents,
      recipientName: params.recipientName?.trim() || null,
      recipientEmail,
      message: params.message?.trim().slice(0, 500) || null,
    },
    select: { id: true },
  });
  logActivity({
    companyId: company.id,
    userId: params.actorId,
    userName: params.actorName,
    entityType: "invoice",
    entityId: invoice.id,
    action: "gift_card_sold",
    detail: `Gift card $${amount.toFixed(2)} (${ganTail(card.gan)}) — activates when invoice #${invoice.invoiceNumber} is paid`,
  });
  return { saleId: sale.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, publicToken: invoice.publicToken, giftCardId: card.id, gan: card.gan, amountCents: params.amountCents };
}

/**
 * The invoice behind a sale is PAID → activate the card and email the
 * number. Called by recordPayment (best effort) and the cron retry. Safe to
 * call twice: Square's idempotency key is the sale id, and an ACTIVE row is
 * skipped.
 */
export async function activateGiftCardForInvoice(invoiceId: string): Promise<"activated" | "skipped" | "failed"> {
  const sale = await prisma.giftCardSale.findUnique({
    where: { invoiceId },
    select: {
      id: true,
      companyId: true,
      squareGiftCardId: true,
      gan: true,
      amountCents: true,
      state: true,
      attempts: true,
      recipientName: true,
      recipientEmail: true,
      message: true,
      invoice: {
        select: {
          status: true,
          invoiceNumber: true,
          contact: { select: { firstName: true, email: true } },
          payments: { select: { id: true, processorRef: true, method: true }, orderBy: { paidAt: "desc" } },
        },
      },
      company: { select: { name: true, email: true, phone: true, logoUrl: true, brandColor: true, documentColor: true, brandColorSecondary: true, squareLocationId: true } },
    },
  });
  if (!sale || sale.state === "ACTIVE" || sale.invoice.status !== "PAID" || !sale.company.squareLocationId) return "skipped";
  if (sale.attempts >= MAX_ACTIVATION_ATTEMPTS) return "skipped";

  const instruments = sale.invoice.payments.map((p) => (p.processorRef && p.method !== "GIFT_CARD" ? p.processorRef : `wb:${p.id}`)).slice(0, 10);
  const loaded = await loadSquareGiftCard(sale.companyId, {
    giftCardId: sale.squareGiftCardId,
    locationId: sale.company.squareLocationId,
    amountCents: sale.amountCents,
    paymentInstrumentIds: instruments.length ? instruments : [`wb:${sale.id}`],
    referenceId: `inv-${sale.invoice.invoiceNumber}`,
    idempotencyKey: `gc-activate:${sale.id}`,
    activate: true,
  });
  if (!loaded.ok) {
    await prisma.giftCardSale.update({
      where: { id: sale.id },
      data: { state: "FAILED", attempts: { increment: 1 }, lastError: loaded.message.slice(0, 300) },
    });
    if (!loaded.transient) reportError("[gift-cards] activation refused", sale.id, loaded.message);
    return "failed";
  }
  await prisma.giftCardSale.update({ where: { id: sale.id }, data: { state: "ACTIVE", activatedAt: new Date(), lastError: null } });
  logActivity({
    companyId: sale.companyId,
    userName: "Square",
    entityType: "invoice",
    entityId: invoiceId,
    action: "gift_card_activated",
    detail: `Gift card ${ganTail(sale.gan)} loaded with $${(sale.amountCents / 100).toFixed(2)}`,
  });

  // The number goes to the recipient when one was named, else to the buyer.
  const to = sale.recipientEmail ?? sale.invoice.contact?.email ?? null;
  if (to) {
    const { subject, html } = giftCardEmail({
      brand: sale.company,
      companyName: sale.company.name,
      recipientName: sale.recipientName ?? (sale.recipientEmail ? null : sale.invoice.contact?.firstName ?? null),
      gan: sale.gan,
      amount: sale.amountCents / 100,
      message: sale.message,
    });
    await sendEmail({ companyId: sale.companyId, to, subject, html, replyTo: sale.company.email || undefined, fromName: sale.company.name }).catch((e) =>
      reportError("[gift-cards] number email failed", sale.id, e)
    );
  }
  return "activated";
}

/** Hourly: activations Square refused (or that never ran) on paid invoices. */
export async function runGiftCardActivationSweep(now: Date = new Date()): Promise<{ checked: number; activated: number; errors: number }> {
  void now;
  const due = await prisma.giftCardSale.findMany({
    where: { state: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_ACTIVATION_ATTEMPTS }, invoice: { is: { status: "PAID" } } },
    select: { invoiceId: true },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  const out = { checked: due.length, activated: 0, errors: 0 };
  for (const row of due) {
    try {
      if ((await activateGiftCardForInvoice(row.invoiceId)) === "activated") out.activated++;
      else out.errors++;
    } catch (err) {
      out.errors++;
      reportError("[gift-cards] sweep failed", row.invoiceId, err);
    }
  }
  return out;
}

export type GiftCardLookup = { id: string; gan: string; tail: string; state: string; balanceCents: number };

/** A card by its number, for a balance check or a redemption. */
export async function lookupGiftCard(companyId: string, rawGan: string): Promise<GiftCardLookup> {
  const gan = normalizeGan(rawGan);
  if (!gan) throw new GiftCardError("Enter the gift card number (16 digits).");
  const read = await retrieveSquareGiftCardByGan(companyId, gan);
  if (!read.ok) throw fromFailure(read);
  if (!read.data) throw new GiftCardError("No gift card with that number on this account.", 404, "NOT_FOUND");
  const card = read.data;
  return { id: card.id, gan, tail: ganTail(gan), state: card.state, balanceCents: card.balanceCents };
}

export type GiftCardRedemption = {
  paymentId: string;
  amount: number;
  remaining: number;
  fullyPaid: boolean;
  cardBalanceCents: number;
  tail: string;
};

/**
 * Pay an invoice with a gift card: min(card balance, invoice balance, the
 * amount asked for). The charge is a Square payment whose source is the
 * card, under the invoice's charge lock like any other charge.
 */
export async function redeemGiftCardOnInvoice(params: {
  companyId: string;
  invoiceId: string;
  gan: string;
  amountCents?: number | null;
  recordedById?: string | null;
  recordedByName?: string | null;
  /** The client did it from the pay page (receipt wording). */
  byClient?: boolean;
}): Promise<GiftCardRedemption> {
  const company = await companyForGiftCards(params.companyId);
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, companyId: company.id },
    select: { id: true, status: true, invoiceNumber: true, total: true, payments: { select: { amount: true, surchargeAmount: true } }, contact: { select: { email: true } } },
  });
  if (!invoice) throw new GiftCardError("Invoice not found.", 404);
  if (invoice.status === "PAID") throw new GiftCardError("This invoice is already paid.");
  if (invoice.status === "ARCHIVED") throw new GiftCardError("This invoice is no longer active.");
  const card = await lookupGiftCard(company.id, params.gan);
  if (card.state !== "ACTIVE") throw new GiftCardError(card.state === "PENDING" ? "That gift card hasn't been paid for yet." : "That gift card can't be used.", 400, "CARD_INACTIVE");
  if (card.balanceCents <= 0) throw new GiftCardError("That gift card has no balance left.", 400, "NO_BALANCE");

  if (!(await acquireChargeLock(invoice.id))) throw new GiftCardError("A payment on this invoice is already processing. Give it a moment, then try again.", 409);
  try {
    const fresh = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { status: true, total: true, payments: { select: { amount: true, surchargeAmount: true } } },
    });
    const balanceCents = Math.round(invoiceBalance(fresh) * 100);
    if (fresh.status === "PAID" || balanceCents <= 0) throw new GiftCardError("Nothing left to pay.");
    let amountCents = Math.min(balanceCents, card.balanceCents);
    if (params.amountCents != null && Number.isFinite(params.amountCents) && params.amountCents > 0) amountCents = Math.min(amountCents, Math.round(params.amountCents));
    if (amountCents <= 0) throw new GiftCardError("Nothing to charge.");

    const { token } = await squareTokenForCompany(company.id);
    let payment;
    try {
      payment = await createSquarePayment({
        token,
        idempotencyKey: `gc-redeem:${invoice.id}:${card.id}:${amountCents}:${Math.floor(Date.now() / 60_000)}`,
        sourceId: card.id,
        amountCents,
        locationId: company.squareLocationId,
        referenceId: `inv-${invoice.invoiceNumber}`,
        note: `Invoice #${invoice.invoiceNumber} — ${company.name} (gift card)`,
        buyerEmail: invoice.contact?.email ?? null,
      });
    } catch (err) {
      if (err instanceof SquareError) throw new GiftCardError(err.status >= 500 || err.status === 429 ? "Square didn't answer — try again in a moment." : declineMessage(err.code), err.status >= 500 ? 424 : 402, err.code ?? undefined);
      throw err;
    }
    const amount = amountCents / 100;
    const { fullyPaid } = await recordPayment({
      companyId: company.id,
      invoiceId: invoice.id,
      amount,
      method: "GIFT_CARD",
      processorRef: payment.id,
      details: `Gift card ${card.tail}${params.byClient ? " (online)" : ""}`,
      recordedById: params.recordedById ?? null,
      emailReceipt: true,
    });
    if (params.recordedByName) {
      logActivity({
        companyId: company.id,
        userId: params.recordedById ?? undefined,
        userName: params.recordedByName,
        entityType: "invoice",
        entityId: invoice.id,
        action: "gift_card_redeemed",
        detail: `$${amount.toFixed(2)} from gift card ${card.tail}`,
      });
    }
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { total: true, payments: { select: { amount: true, surchargeAmount: true } } } });
    return { paymentId: payment.id, amount, remaining: Math.max(0, invoiceBalance(after)), fullyPaid, cardBalanceCents: card.balanceCents - amountCents, tail: card.tail };
  } finally {
    await releaseChargeLock(invoice.id);
  }
}

/** The cards on the seller's account, newest first, with WorkBench's sale record when there is one. */
export async function giftCardsOverview(companyId: string, params: { cursor?: string | null; customerId?: string | null } = {}) {
  const read = await listSquareGiftCards(companyId, { cursor: params.cursor, customerId: params.customerId });
  const sales = await prisma.giftCardSale.findMany({
    where: { companyId },
    select: { id: true, squareGiftCardId: true, state: true, amountCents: true, recipientName: true, recipientEmail: true, invoiceId: true, lastError: true, createdAt: true, invoice: { select: { invoiceNumber: true, status: true, publicToken: true } }, contact: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { read, sales };
}

/**
 * "Delete" a gift card (2026-10-30 request). Square has no delete: the card
 * is DEACTIVATED there — the balance left on it is forfeited and it can
 * never be reactivated — and a WorkBench sale still waiting on its invoice
 * is closed out (the unpaid invoice is archived so nobody pays for a dead
 * card). A PENDING card Square won't deactivate (nothing was ever loaded)
 * stays an empty shell on the Square account; the sale still goes, and the
 * list hides the shell. Managers only (the route checks).
 */
export async function removeGiftCard(params: { companyId: string; giftCardId: string; actorId: string; actorName: string }): Promise<{ state: string }> {
  const company = await companyForGiftCards(params.companyId);
  const read = await retrieveSquareGiftCard(company.id, params.giftCardId);
  if (!read.ok) throw fromFailure(read);
  const card = read.data;
  const sale = await prisma.giftCardSale.findFirst({
    where: { companyId: company.id, squareGiftCardId: params.giftCardId },
    select: { id: true, state: true, invoice: { select: { id: true, status: true, invoiceNumber: true } } },
  });
  let state = card.state;
  if (card.state !== "DEACTIVATED") {
    const done = await deactivateSquareGiftCard(company.id, { giftCardId: card.id, locationId: company.squareLocationId, idempotencyKey: `gcx:${card.id}` });
    if (done.ok) state = "DEACTIVATED";
    else if (card.state !== "PENDING" || done.transient) throw fromFailure(done);
    else console.warn(`[gift-cards] Square would not deactivate pending card ${card.id}: ${done.message}`);
  }
  if (sale) {
    if (sale.invoice.status !== "PAID" && sale.invoice.status !== "ARCHIVED") {
      await prisma.invoice.update({ where: { id: sale.invoice.id }, data: { status: "ARCHIVED" } }).catch(() => {});
    }
    await prisma.giftCardSale.update({ where: { id: sale.id }, data: { state: "DEACTIVATED" } }).catch(() => {});
  }
  if (sale) {
    logActivity({
      companyId: company.id,
      userId: params.actorId,
      userName: params.actorName,
      entityType: "invoice",
      entityId: sale.invoice.id,
      action: "gift_card_deactivated",
      detail: `Gift card ${ganTail(card.gan)} deactivated${card.balanceCents > 0 ? ` with $${(card.balanceCents / 100).toFixed(2)} left` : ""}${sale.invoice.status !== "PAID" ? ` — invoice #${sale.invoice.invoiceNumber} archived` : ""}`,
    });
  }
  return { state };
}
