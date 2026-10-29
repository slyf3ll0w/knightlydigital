import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { SquareError, isTransientSquareError, verifySquareWebhookSignature, type SquareWebhookEvent } from "@/lib/square";
import { planBillingCredentials, recordInvoiceEvent, refreshSubscription } from "@/lib/plan-billing";
import { retrieveSquareInvoice } from "@/lib/square-billing-api";

/**
 * Square webhook receiver for WORKBENCH'S OWN account — plan billing
 * (lib/plan-billing.ts). Separate from /api/public/webhooks/square (the
 * sellers' account events) because it is a different Square account with
 * its own subscription and signature key. Made once per environment in the
 * Developer Console under the WorkBench application:
 *   URL     ${NEXTAUTH_URL}/api/public/webhooks/square-billing   (SQUARE_BILLING_WEBHOOK_URL overrides)
 *   events  subscription.created, subscription.updated,
 *           invoice.payment_made, invoice.scheduled_charge_failed, invoice.updated
 *   key     SQUARE_BILLING_WEBHOOK_SIGNATURE_KEY
 *
 * Signature first (401 otherwise). Then the payload is only a HINT: the
 * subscription / invoice is re-fetched with our token before anything
 * changes. Handlers are idempotent and never bounce — Square retries for a
 * day, and the hourly sweep re-reads anything missed anyway.
 */
export async function POST(req: NextRequest) {
  const creds = await planBillingCredentials();
  if (!creds) return NextResponse.json({ received: true });

  const rawBody = await req.text();
  const notificationUrl =
    process.env.SQUARE_BILLING_WEBHOOK_URL ??
    `${(process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")}/api/public/webhooks/square-billing`;
  const ok = verifySquareWebhookSignature({
    rawBody,
    signatureHeader: req.headers.get("x-square-hmacsha256-signature"),
    notificationUrl,
    signatureKey: process.env.SQUARE_BILLING_WEBHOOK_SIGNATURE_KEY ?? "",
  });
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let event: SquareWebhookEvent | null = null;
  try {
    event = JSON.parse(rawBody) as SquareWebhookEvent;
  } catch {
    return NextResponse.json({ received: true });
  }
  if (!event?.type) return NextResponse.json({ received: true });

  try {
    const objectId = event.data?.id;
    switch (event.type) {
      case "subscription.created":
      case "subscription.updated":
        if (objectId) await refreshSubscription(objectId);
        break;
      case "invoice.payment_made":
      case "invoice.scheduled_charge_failed":
      case "invoice.updated":
      case "invoice.published":
      case "invoice.canceled": {
        if (!objectId) break;
        const invoice = await retrieveSquareInvoice(creds.token, objectId); // re-fetch = verification
        await recordInvoiceEvent(invoice, event.type);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    if (!(err instanceof SquareError && isTransientSquareError(err))) {
      reportError("[square-billing webhook] handler failed", err);
    }
  }

  return NextResponse.json({ received: true });
}
