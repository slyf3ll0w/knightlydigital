/**
 * Payment processor stub.
 * Replace the functions below with real calls to your chosen processor
 * (Stripe, Finix, Square, etc.). The interface intentionally mirrors
 * what a real integration would look like so the swap is mechanical.
 */

export type PaymentResult =
  | { success: true; transactionId: string; amount: number }
  | { success: false; error: string };

export type PaymentLinkResult =
  | { success: true; url: string; expiresAt: Date }
  | { success: false; error: string };

export interface ChargeParams {
  amount: number;          // in dollars
  currency?: string;       // default "usd"
  method: "card" | "ach";
  surcharge?: number;      // additional amount passed to customer
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentLinkParams {
  invoiceId: string;
  amount: number;
  customerEmail?: string;
  description?: string;
  expiresInDays?: number;
}

/** Charge a card or bank account. */
export async function chargePayment(_params: ChargeParams): Promise<PaymentResult> {
  // TODO: replace with real processor call
  // Example Stripe: await stripe.paymentIntents.create({ amount: params.amount * 100, ... })
  return {
    success: true,
    transactionId: `mock_${Date.now()}`,
    amount: _params.amount + (_params.surcharge ?? 0),
  };
}

/** Generate a hosted payment link the customer can click to pay. */
export async function createPaymentLink(params: PaymentLinkParams): Promise<PaymentLinkResult> {
  // TODO: replace with real processor call
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return {
    success: true,
    url: `${baseUrl}/pay/${params.invoiceId}`,
    expiresAt: new Date(Date.now() + (params.expiresInDays ?? 30) * 86400 * 1000),
  };
}

/** Calculate the surcharge amount for a given payment total and rate. */
export function calculateSurcharge(amount: number, rateDecimal: number): number {
  return Math.round(amount * rateDecimal * 100) / 100;
}

/** Send a payment reminder via email/SMS (stub — wire to Resend/Twilio). */
export async function sendPaymentReminder(_params: {
  invoiceId: string;
  email?: string;
  phone?: string;
  amount: number;
  dueDate?: Date;
}): Promise<void> {
  // TODO: integrate email (Resend) and SMS (Twilio)
  console.log("[payments] reminder sent for invoice", _params.invoiceId);
}

/** Fire a review request after payment (stub — wire to email/SMS). */
export async function sendReviewRequest(_params: {
  companyName: string;
  reviewLink: string;
  email?: string;
  phone?: string;
}): Promise<void> {
  // TODO: integrate email (Resend) and SMS (Twilio)
  console.log("[payments] review request sent");
}
