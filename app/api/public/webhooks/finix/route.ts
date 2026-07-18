import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMerchant, getTransfer, finixConfigured } from "@/lib/finix";
import { recomputeInvoiceStatus } from "@/lib/payments";
import { notifyUsers } from "@/lib/push";

/**
 * Finix webhook receiver. Register once per environment with
 * scripts/finix-register-webhook.mjs.
 *
 * SECURITY: the payload is treated as a HINT, never as truth — we extract the
 * resource id, re-fetch it from the Finix API with our credentials, and act on
 * that. A forged webhook can therefore only make us look at real data. Webhooks
 * are also a fast path, not a required one: merchant state is re-synced when
 * the Settings payments card loads, so missed events self-heal.
 *
 * Handled:
 *  - merchant created/updated  → sync Company.finixOnboardingState (+ owner push on approval)
 *  - transfer updated → FAILED → remove the recorded payment (late ACH returns)
 */
export async function POST(req: NextRequest) {
  if (!finixConfigured()) return NextResponse.json({ received: true });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ received: true });

  // Payload shape: { entity, type, _embedded: { merchants: [...] } } (or
  // transfers/...). Pull ids defensively — versions vary.
  const embedded = body._embedded ?? {};
  const merchantHint = embedded.merchants?.[0]?.id;
  const transferHint = embedded.transfers?.[0]?.id;

  try {
    if (typeof merchantHint === "string" && merchantHint.startsWith("MU")) {
      await handleMerchant(merchantHint);
    }
    if (typeof transferHint === "string" && transferHint.startsWith("TR")) {
      await handleTransfer(transferHint);
    }
  } catch (err) {
    // Never bounce webhooks — Finix retries failures and the state re-syncs on
    // settings load anyway.
    console.error("[finix webhook] handler failed", err);
  }

  return NextResponse.json({ received: true });
}

async function handleMerchant(merchantId: string) {
  const merchant = await getMerchant(merchantId); // re-fetch = verification
  const company =
    (await prisma.company.findFirst({ where: { finixMerchantId: merchant.id } })) ??
    // First event for a new merchant: the company only knows its identity so far
    (await prisma.company.findFirst({ where: { finixIdentityId: merchant.identity } }));
  if (!company) return;

  const becameApproved =
    merchant.onboarding_state === "APPROVED" &&
    company.finixOnboardingState !== "APPROVED";

  await prisma.company.update({
    where: { id: company.id },
    data: {
      finixMerchantId: merchant.id,
      finixIdentityId: merchant.identity,
      finixOnboardingState: merchant.onboarding_state,
    },
  });

  if (becameApproved) {
    const owners = await prisma.user.findMany({
      where: { companyId: company.id, role: "OWNER", isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      owners.map((o) => o.id),
      {
        title: "Online payments approved!",
        body: "Your payment account is live — clients can now pay invoices by card or bank online.",
        url: "/app/settings",
        tag: "payments-approved",
      }
    );
  }
}

async function handleTransfer(transferId: string) {
  const transfer = await getTransfer(transferId); // re-fetch = verification
  if (transfer.state !== "FAILED" && transfer.state !== "CANCELED") return;

  // An accepted ACH debit we recorded can fail days later (insufficient funds,
  // closed account). Pull the payment record back out so the invoice reopens.
  const payment = await prisma.payment.findFirst({
    where: { processorRef: transfer.id },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  if (!payment) return;

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: payment.id } });
    await recomputeInvoiceStatus(tx, payment.invoiceId);
  });

  const owners = await prisma.user.findMany({
    where: { companyId: payment.companyId, role: "OWNER", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    owners.map((o) => o.id),
    {
      title: `Payment failed — invoice #${payment.invoice?.invoiceNumber ?? ""}`,
      body: `A $${Number(payment.amount).toFixed(2)} online payment was returned by the bank. The invoice is open again.`,
      url: `/app/invoices/${payment.invoiceId}`,
      tag: `payment-failed-${payment.invoiceId}`,
    }
  );
}
