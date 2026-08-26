/**
 * Autopay engine: card-on-file charging for engine-generated (subscription)
 * invoices, with Stripe-style retry + dunning on failures.
 *
 * The flow: `attemptAutoCharge` resolves which card to charge — the series'
 * pinned card (Subscription.savedCardId), else the contact's default
 * SavedCard, else the legacy Contact.processorCustomerRef mirror — and runs
 * the charge. A failure is classified hard vs soft from the processor's
 * decline code: soft declines (insufficient funds, do-not-honor, issuer
 * hiccups) are retried by the hourly cron on a +1d / +3d / +7d schedule
 * (max 4 attempts total, far under the card networks' retry caps); hard
 * declines (lost/stolen, invalid, expired, closed) stop immediately —
 * retrying those is pointless and risks network fines.
 *
 * Dunning: the first failure emails the client a "payment issue" note with a
 * hub link to update their card (plus the pay link), logs to the invoice's
 * ActivityLog, and pushes to the owners. Retries run silently; giving up
 * (hard decline or retries exhausted) notifies the owners again. Saving a
 * new card through the hub or by staff calls `reviveAutopayForContact`, which
 * reschedules every given-up invoice for the next cron pass — the HCP
 * "update your card and we'll collect what's due" pattern.
 */

import { prisma } from "@/lib/db";
import {
  getProcessor,
  recordPayment,
  invoiceBalance,
  acquireChargeLock,
  releaseChargeLock,
} from "@/lib/payments";
import { defaultSavedCard } from "@/lib/saved-cards";
import { logActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/push";
import { sendEmail, autopayFailedEmail, cardExpiringEmail } from "@/lib/email";

/** Hours until the next retry, keyed by how many attempts have failed. */
const RETRY_DELAY_HOURS: Record<number, number> = { 1: 24, 2: 72, 3: 168 };
/** Total attempts (1 initial + 3 retries) before autopay gives up. */
export const MAX_AUTO_CHARGE_ATTEMPTS = 4;

/**
 * Hard declines: the card itself is dead — retrying can never succeed until
 * the client saves a different card. Matched against the processor decline
 * code first, falling back to the message. Unknown codes default to soft
 * (retryable): the attempt cap bounds the damage either way.
 */
const HARD_DECLINE = /lost|stolen|invalid|expired|fraud|pick.?up|restricted|closed|not.?permitted|security|revocation|no.?such|unsupported/i;

export function classifyDecline(error: string, code?: string | null): "hard" | "soft" {
  return HARD_DECLINE.test(code ?? "") || HARD_DECLINE.test(error) ? "hard" : "soft";
}

export type AutoChargeOutcome = "charged" | "failed" | "no_card" | "not_live" | "locked";

/**
 * Charge one engine-generated invoice to the client's card on file. Success
 * records the payment (receipt, owner push, QBO) and clears any retry
 * schedule; failure books the retry/dunning state. Card resolution happens
 * here, at charge time, so a card the client updated between attempts is
 * picked up automatically.
 */
export async function attemptAutoCharge(params: {
  companyId: string;
  invoiceId: string;
  subscriptionId: string;
  amount: number;
  chargeDescription: string;
  paymentDetails: string;
}): Promise<AutoChargeOutcome> {
  const processor = getProcessor();
  if (!processor.live) return "not_live";

  const sub = await prisma.subscription.findFirst({
    where: { id: params.subscriptionId, companyId: params.companyId },
    select: {
      id: true,
      name: true,
      savedCard: { select: { id: true, instrumentRef: true, label: true, contactId: true } },
      contact: { select: { id: true, processorCustomerRef: true, savedCardLabel: true } },
    },
  });
  if (!sub) return "no_card";

  // Pinned card → default card → legacy mirror. A pinned card that was
  // deleted SetNulls back to the default automatically.
  const pinned = sub.savedCard?.contactId === sub.contact.id ? sub.savedCard : null;
  const fallback = pinned ? null : await defaultSavedCard(sub.contact.id);
  const instrumentRef =
    pinned?.instrumentRef ?? fallback?.instrumentRef ?? sub.contact.processorCustomerRef;
  const cardLabel = pinned?.label ?? fallback?.label ?? sub.contact.savedCardLabel;
  if (!instrumentRef) return "no_card";

  // One charge in flight per invoice: a staff "Charge card" or the client on
  // /pay racing this sweep would each pass their own balance check and charge
  // twice. Locked = someone else is mid-charge right now; their success clears
  // the retry schedule, their failure leaves ours to fire on the next pass.
  if (!(await acquireChargeLock(params.invoiceId))) return "locked";
  try {
    const result = await processor.chargeStored({
      customerRef: instrumentRef,
      amount: params.amount,
      description: params.chargeDescription,
      metadata: { invoiceId: params.invoiceId, subscriptionId: sub.id },
    });

    if (result.success) {
      await recordPayment({
        companyId: params.companyId,
        invoiceId: params.invoiceId,
        amount: params.amount,
        method: "CARD",
        processorRef: result.transactionId,
        cardBrand: result.cardBrand,
        cardType: result.cardType,
        details: `${params.paymentDetails}${cardLabel ? ` (${cardLabel})` : ""}`,
        receiptPending: result.pending,
      });
      await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: { autoChargeNextAt: null, autoChargeGaveUpAt: null, autoChargeLastError: null },
      });
      return "charged";
    }

    await handleAutoChargeFailure({
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      amount: params.amount,
      cardLabel,
      error: result.error,
      code: result.code,
    }).catch((e) => console.error("[auto-charge] failure handling failed", params.invoiceId, e));
    return "failed";
  } finally {
    await releaseChargeLock(params.invoiceId);
  }
}

/** Book the retry state, audit it, and run first-failure / give-up dunning. */
async function handleAutoChargeFailure(params: {
  companyId: string;
  invoiceId: string;
  amount: number;
  cardLabel: string | null;
  error: string;
  code?: string | null;
}): Promise<void> {
  const now = new Date();
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    select: {
      invoiceNumber: true,
      publicToken: true,
      autoChargeAttempts: true,
      contact: { select: { firstName: true, lastName: true, email: true, hubToken: true } },
      company: {
        select: {
          name: true,
          email: true,
          brandColor: true,
          documentColor: true,
          brandColorSecondary: true,
          logoUrl: true,
        },
      },
    },
  });
  if (!invoice) return;

  const attempts = invoice.autoChargeAttempts + 1;
  const kind = classifyDecline(params.error, params.code);
  const giveUp = kind === "hard" || attempts >= MAX_AUTO_CHARGE_ATTEMPTS;
  const nextAt = giveUp
    ? null
    : new Date(now.getTime() + (RETRY_DELAY_HOURS[attempts] ?? 168) * 3600_000);

  await prisma.invoice.update({
    where: { id: params.invoiceId },
    data: {
      autoChargeAttempts: attempts,
      autoChargeNextAt: nextAt,
      autoChargeLastError: params.error.slice(0, 500),
      autoChargeGaveUpAt: giveUp ? now : null,
    },
  });

  logActivity({
    companyId: params.companyId,
    userName: "Autopay",
    entityType: "invoice",
    entityId: params.invoiceId,
    action: "auto_charge_failed",
    detail: `$${params.amount.toFixed(2)} to ${params.cardLabel ?? "card on file"} declined — ${params.error}${
      giveUp
        ? kind === "hard"
          ? " (card unusable — autopay stopped)"
          : " (retries exhausted — autopay stopped)"
        : ` (attempt ${attempts} of ${MAX_AUTO_CHARGE_ATTEMPTS}, will retry)`
    }`,
  });

  // Owners hear about the first failure and the give-up — not every retry.
  if (attempts === 1 || giveUp) {
    const owners = await prisma.user.findMany({
      where: { companyId: params.companyId, role: "OWNER", isActive: true },
      select: { id: true },
    });
    const clientName = [invoice.contact?.firstName, invoice.contact?.lastName]
      .filter(Boolean)
      .join(" ");
    await notifyUsers(
      owners.map((o) => o.id),
      {
        title: giveUp
          ? `Autopay stopped — invoice #${invoice.invoiceNumber}`
          : `Auto-charge failed — invoice #${invoice.invoiceNumber}`,
        body: `${clientName ? `${clientName} · ` : ""}$${params.amount.toFixed(2)} — ${params.error}`,
        url: `/app/invoices/${params.invoiceId}`,
        tag: `autopay-${params.invoiceId}`,
      }
    ).catch((e) => console.error("[auto-charge] owner notify failed", e));
  }

  // The client hears once, on the first failure: their card declined, with a
  // link to fix it (and the pay link as the manual fallback). Retries stay
  // silent — the escalating invoice reminders take over if it stays unpaid.
  if (attempts === 1 && invoice.contact?.email) {
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
    const { subject, html } = autopayFailedEmail({
      brand: invoice.company,
      companyName: invoice.company.name,
      invoiceNumber: invoice.invoiceNumber,
      total: params.amount,
      cardLabel: params.cardLabel,
      payUrl: `${baseUrl}/pay/${invoice.publicToken}`,
      updateCardUrl: `${baseUrl}/hub/${invoice.contact.hubToken}/payment-method`,
    });
    await sendEmail({
      companyId: params.companyId,
      to: invoice.contact.email,
      subject,
      html,
      replyTo: invoice.company.email || undefined,
      fromName: invoice.company.name,
    }).catch((e) => console.error("[auto-charge] client dunning email failed", e));
  }
}

export interface RetryRunSummary {
  processed: number;
  charged: number;
  failed: number;
  cleared: number;
}

/**
 * Cron sweep: re-attempt every autopay invoice whose retry is due. Charges
 * the remaining balance (a partial manual payment in the meantime shrinks the
 * retry, and a fully-covered invoice just gets its schedule cleared).
 */
export async function runAutoChargeRetries(now: Date = new Date()): Promise<RetryRunSummary> {
  const summary: RetryRunSummary = { processed: 0, charged: 0, failed: 0, cleared: 0 };
  if (!getProcessor().live) return summary;

  const due = await prisma.invoice.findMany({
    where: {
      autoChargeNextAt: { not: null, lte: now },
      autoChargeGaveUpAt: null,
      status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] },
      subscriptionId: { not: null },
      company: { is: { suspendedAt: null } },
    },
    select: {
      id: true,
      companyId: true,
      subscriptionId: true,
      subject: true,
      total: true,
      payments: { select: { amount: true, surchargeAmount: true } },
      company: { select: { name: true } },
    },
    orderBy: { autoChargeNextAt: "asc" },
    take: 200,
  });

  for (const inv of due) {
    try {
      // Claim before charging: push the due stamp forward atomically so an
      // overlapping sweep (double-registered cron, or a slow run crossing the
      // next hourly fire) can't re-charge the same invoice minutes later —
      // the processor's minute-windowed idempotency only covers same-minute
      // repeats. A short lease rather than null so a crash mid-charge
      // self-heals on a later sweep instead of silently stalling autopay;
      // success/failure below overwrite it with the real schedule.
      const claim = await prisma.invoice.updateMany({
        where: { id: inv.id, autoChargeNextAt: { not: null, lte: now } },
        data: { autoChargeNextAt: new Date(now.getTime() + 3600_000) },
      });
      if (claim.count === 0) continue; // another sweep already has it

      summary.processed++;
      const balance = invoiceBalance(inv);
      if (balance <= 0) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { autoChargeNextAt: null },
        });
        summary.cleared++;
        continue;
      }
      const outcome = await attemptAutoCharge({
        companyId: inv.companyId,
        invoiceId: inv.id,
        subscriptionId: inv.subscriptionId!,
        amount: balance,
        chargeDescription: `${inv.subject ?? "Subscription"} — ${inv.company.name}`,
        paymentDetails: "Auto-charged (retry)",
      });
      if (outcome === "charged") summary.charged++;
      else if (outcome === "failed") summary.failed++;
      else if (outcome === "locked") {
        // Another charge path (staff, /pay) holds this invoice right now —
        // the 1-hour lease from the claim above is the natural retry.
        continue;
      } else {
        // No card / processor down: push the retry forward a day rather than
        // burning an attempt on a charge that never reached the processor.
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { autoChargeNextAt: new Date(now.getTime() + 24 * 3600_000) },
        });
      }
    } catch (err) {
      summary.failed++;
      console.error("[auto-charge] retry failed for", inv.id, err);
    }
  }
  return summary;
}

/**
 * The client saved a new card — give every stalled autopay invoice another
 * shot on the next cron pass (attempt count keeps accruing toward the cap,
 * but a give-up is un-given-up: the new card deserves a try).
 */
export async function reviveAutopayForContact(contactId: string): Promise<number> {
  const revived = await prisma.invoice.updateMany({
    where: {
      contactId,
      subscriptionId: { not: null },
      status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] },
      OR: [{ autoChargeGaveUpAt: { not: null } }, { autoChargeNextAt: { not: null } }],
    },
    data: { autoChargeNextAt: new Date(), autoChargeGaveUpAt: null, autoChargeAttempts: 1 },
  });
  return revived.count;
}

/**
 * Cron sweep: nudge clients whose autopay card expires within ~30 days (or
 * already has). Once per card row; only for clients with an ACTIVE billed
 * series (no point nagging about a card nothing charges) and only when the
 * company can actually take payments.
 */
export async function runCardExpiryNudges(now: Date = new Date()): Promise<number> {
  if (!getProcessor().live) return 0;

  const candidates = await prisma.savedCard.findMany({
    where: {
      expiryNudgeSentAt: null,
      expMonth: { not: null },
      expYear: { not: null },
      contact: {
        email: { not: null },
        subscriptions: {
          some: {
            status: "ACTIVE",
            OR: [{ interval: { not: null } }, { billPerVisit: true }],
          },
        },
        company: { is: { suspendedAt: null, finixOnboardingState: "APPROVED" } },
      },
    },
    select: {
      id: true,
      label: true,
      expMonth: true,
      expYear: true,
      companyId: true,
      contact: {
        select: {
          email: true,
          hubToken: true,
          company: {
            select: {
              name: true,
              email: true,
              brandColor: true,
              documentColor: true,
              brandColorSecondary: true,
              logoUrl: true,
            },
          },
        },
      },
    },
    take: 200,
  });

  const horizon = new Date(now.getTime() + 30 * 86400000);
  let sent = 0;
  for (const card of candidates) {
    // A card is good through the last day of its expiry month.
    const expiresAt = new Date(card.expYear!, card.expMonth!, 1); // first day AFTER the exp month
    if (expiresAt > horizon) continue;
    try {
      const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
      const { subject, html } = cardExpiringEmail({
        brand: card.contact.company,
        companyName: card.contact.company.name,
        cardLabel: card.label,
        expired: expiresAt <= now,
        updateCardUrl: `${baseUrl}/hub/${card.contact.hubToken}/payment-method`,
      });
      const ok = await sendEmail({
        companyId: card.companyId,
        to: card.contact.email!,
        subject,
        html,
        replyTo: card.contact.company.email || undefined,
        fromName: card.contact.company.name,
      });
      if (ok) {
        await prisma.savedCard.update({
          where: { id: card.id },
          data: { expiryNudgeSentAt: now },
        });
        sent++;
      }
    } catch (err) {
      console.error("[auto-charge] expiry nudge failed for card", card.id, err);
    }
  }
  return sent;
}
