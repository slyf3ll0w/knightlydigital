import { prisma } from "@/lib/db";
import * as square from "@/lib/square";
import { squareTokenForMerchant } from "@/lib/square-connection";

/**
 * Put a card on file at Square WITHOUT charging it: the browser's one-time
 * token (cnon:…) becomes a Square card (ccof:…) under the contact's Square
 * customer, which is created on first use and remembered on
 * Contact.squareCustomerId. The caller stores the result as a SavedCard row
 * (lib/saved-cards.ts) exactly like a Finix instrument. Shared by the client
 * hub and the staff card form.
 */
export async function squareVaultCard(params: {
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    squareCustomerId: string | null;
  };
  merchantId: string;
  paymentToken: string;
  cardholderName?: string | null;
}) {
  const { token } = await squareTokenForMerchant(params.merchantId);
  let customerId = params.contact.squareCustomerId;
  if (!customerId) {
    const customer = await square.createSquareCustomer({
      token,
      idempotencyKey: `cust-${params.contact.id}-${Date.now()}`,
      firstName: params.contact.firstName,
      lastName: params.contact.lastName,
      email: params.contact.email,
      referenceId: params.contact.id,
    });
    customerId = customer.id;
    await prisma.contact.update({ where: { id: params.contact.id }, data: { squareCustomerId: customerId } });
  }
  const card = await square.createSquareCard({
    token,
    idempotencyKey: `card-${params.contact.id}-${params.paymentToken.slice(-16)}`,
    sourceId: params.paymentToken,
    customerId,
    cardholderName: params.cardholderName ?? null,
    referenceId: params.contact.id,
  });
  return {
    customerId,
    instrumentRef: card.id,
    brand: card.card_brand ?? null,
    last4: card.last_4 ?? null,
    expMonth: card.exp_month ?? null,
    expYear: card.exp_year ?? null,
  };
}

/** Removing a card from the client's file also disables it at Square, so a
 *  stray reference can never charge it again. Best effort. */
export async function squareDisableCard(merchantId: string, cardId: string): Promise<void> {
  if (!cardId.startsWith("ccof:")) return;
  try {
    const { token } = await squareTokenForMerchant(merchantId);
    await square.disableSquareCard(token, cardId);
  } catch (err) {
    console.warn("[square] disable card failed:", err instanceof Error ? err.message : err);
  }
}
