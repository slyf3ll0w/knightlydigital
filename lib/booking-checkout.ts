import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EngineRules, Slot } from "@/lib/booking-engine";
import { slotLabel } from "@/lib/booking-engine";
import type { LoadedBookingType } from "@/lib/booking-runtime";
import { assignMemberForSlot } from "@/lib/booking-runtime";
import { APP_URL, SlotTakenError, upsertBookingContact, type BookingCompanyRow, type CustomerInput } from "@/lib/booking-submit";
import type { ServiceSelection } from "@/lib/booking-services";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { derivedQuoteDeposit } from "@/lib/statuses";
import { createDepositInvoice } from "@/lib/deposits";
import { convertQuoteToJob } from "@/lib/quote-convert";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { acquireChargeLock, calculateSurcharge, getProcessor, recordPayment, releaseChargeLock } from "@/lib/payments";
import { sendEmail, bookingConfirmedEmail, bookingTeamNoticeEmail } from "@/lib/email";
import { companyNotifyAddress } from "@/lib/notify";
import { companyManagerIds, notifyUsers } from "@/lib/push";
import { icsAttachment } from "@/lib/ics";

/**
 * SERVICE booking types: the customer's picks become an APPROVED quote that
 * is converted into a scheduled, assigned job in the same Serializable
 * transaction (deposits, agreements and recurring services all key off a
 * quote, and a booked service is literally an approved quote). When the
 * type collects payment, the transaction also mints the existing deposit
 * invoice (FULL = the whole price), and the card is charged AFTER commit
 * through the same processor path the pay page uses — a card authorization
 * can't live inside a database transaction, and a slot must not stay taken
 * by a card that then declines, so a decline unwinds the booking.
 */

export type ServiceBookingCompany = BookingCompanyRow & {
  defaultTaxRate: Prisma.Decimal | number | null;
  defaultDepositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
  defaultDepositValue: Prisma.Decimal | number | null;
  finixMerchantId: string | null;
  finixOnboardingState: string | null;
  surchargeEnabled: boolean;
  surchargeRate: Prisma.Decimal | number | null;
};

export type ServiceBookingResult =
  | { booking: Record<string, unknown> }
  | { slotTaken: true }
  | { declined: true; error: string }
  | { error: string; status?: number };

/** Can this company take a card right now (same three-part gate as the pay page)? */
export function paymentsLive(company: { finixMerchantId: string | null; finixOnboardingState: string | null }): boolean {
  const processor = getProcessor();
  return processor.name === "finix" && processor.live && Boolean(company.finixMerchantId) && company.finixOnboardingState === "APPROVED";
}

export async function createServiceBooking(params: {
  type: LoadedBookingType;
  company: ServiceBookingCompany;
  customer: CustomerInput;
  slot: Slot;
  rules: EngineRules;
  now: Date;
  selection: ServiceSelection;
  paymentToken: string | null;
  fraudSessionId: string | null;
}): Promise<ServiceBookingResult> {
  const { type, company, customer, slot, rules, now, selection } = params;
  const label = slotLabel(company.timezone, slot.start, slot.windowEnd);

  // Money: only fixed-price picks are chargeable; a "from $" item means we
  // quote on site and nothing is collected now (the page said so).
  const collect = type.paymentMode !== "NONE" && selection.allFixed && paymentsLive(company);
  if (collect && !params.paymentToken) return { error: "Enter your card details to book.", status: 400 };

  const subtotal = selection.total;
  const taxRate = company.defaultTaxRate == null ? null : Number(company.defaultTaxRate);
  const totals = computeQuoteTotals({ subtotal, discountType: "NONE", discountValue: null, taxRate });
  const deposit =
    type.paymentMode === "FULL"
      ? { depositType: "FULL" as const, depositValue: null as number | null }
      : type.paymentMode === "DEPOSIT"
        ? (() => {
            const amount = derivedQuoteDeposit(
              selection.items.map((w) => ({ total: Number(w.unitPrice), deposit: { depositType: w.depositType, depositValue: w.depositValue == null ? null : Number(w.depositValue) } })),
              subtotal,
              { depositType: company.defaultDepositType, depositValue: company.defaultDepositValue == null ? null : Number(company.defaultDepositValue) }
            );
            return amount > 0 ? { depositType: "FIXED" as const, depositValue: amount } : { depositType: "NONE" as const, depositValue: null };
          })()
        : { depositType: "NONE" as const, depositValue: null };
  const title = selection.names.join(", ");

  // ── The booking transaction ─────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof book>>;
  async function book() {
    return withDocNumberRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const contact = await upsertBookingContact(tx, company.id, customer);
          const assigned = await assignMemberForSlot(tx, type, company, rules, slot.start, now);
          if (!assigned) throw new SlotTakenError();

          const lastReq = await tx.request.findFirst({ where: { companyId: company.id }, orderBy: { requestNumber: "desc" }, select: { requestNumber: true } });
          const request = await tx.request.create({
            data: {
              companyId: company.id,
              contactId: contact.id,
              requestNumber: (lastReq?.requestNumber ?? 0) + 1,
              title,
              status: "CONVERTED",
              preferredDate: slot.start,
              source: "booking_form",
              bookingTypeId: type.id,
              details: [
                `Booked online: ${title} — arrival ${label}`,
                `Services: ${selection.items.map((w) => `${w.name} ($${Number(w.unitPrice).toFixed(2)})`).join(", ")}`,
                customer.notes ? `Notes: ${customer.notes}` : null,
                customer.address ? `Address: ${customer.address}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          });
          await enterPipeline(tx, company.id, contact.id);
          await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED");

          const lastQuote = await tx.quote.findFirst({ where: { companyId: company.id }, orderBy: { quoteNumber: "desc" }, select: { quoteNumber: true } });
          const quote = await tx.quote.create({
            data: {
              companyId: company.id,
              contactId: contact.id,
              requestId: request.id,
              publicToken: randomBytes(24).toString("hex"),
              quoteNumber: (lastQuote?.quoteNumber ?? 0) + 1,
              title,
              status: "APPROVED",
              approvedAt: now,
              signatureName: `${customer.firstName} ${customer.lastName}`.trim(),
              subtotal,
              taxRate,
              tax: totals.tax,
              total: totals.total,
              depositType: deposit.depositType,
              depositValue: deposit.depositValue,
              clientMessage: customer.notes,
              sentAt: now,
              lineItems: {
                create: selection.items.map((w, i) => ({
                  name: w.name,
                  description: w.description ?? "",
                  quantity: 1,
                  unitPrice: Number(w.unitPrice),
                  total: Number(w.unitPrice),
                  workItemId: w.id,
                  recurringInterval: w.recurringInterval,
                  requiresAgreement: w.requiresAgreement,
                  sortOrder: i,
                })),
              },
            },
            include: { lineItems: true, contact: true, property: true },
          });

          const job = await convertQuoteToJob(tx, quote, {
            scheduledAt: slot.start,
            scheduledEnd: slot.end,
            assigneeIds: [assigned.userId],
            arrivalWindowMinutes: type.arrivalWindowMinutes,
            address: customer.address,
            requestId: request.id,
            bookingTypeId: type.id,
            bookedOnlineAt: now,
          });

          const depositInvoice = collect ? await createDepositInvoice(tx, quote) : null;
          return { contact, request, quote, job, depositInvoice, assignedUserId: assigned.userId };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
  }
  try {
    result = await book();
  } catch (e) {
    if (e instanceof SlotTakenError || (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034")) return { slotTaken: true };
    throw e;
  }

  // ── Charge (after commit) ───────────────────────────────────────────────
  let paidNote: string | null = null;
  if (collect && result.depositInvoice) {
    const inv = result.depositInvoice.invoice;
    const amount = result.depositInvoice.amount;
    const surchargeAmount = company.surchargeEnabled ? calculateSurcharge(amount, company.surchargeRate == null ? 0 : Number(company.surchargeRate)) : 0;
    if (!(await acquireChargeLock(inv.id))) {
      await unwind(result);
      return { declined: true, error: "That payment is already processing — please try again in a moment." };
    }
    try {
      const charge = await getProcessor().charge({
        amount: amount + surchargeAmount,
        method: "card",
        surcharge: surchargeAmount,
        description: `${title} — ${company.name} (booked online)`,
        metadata: { invoiceId: inv.id, companyId: company.id, bookingTypeId: type.id },
        token: params.paymentToken ?? undefined,
        merchantRef: company.finixMerchantId ?? undefined,
        fraudSessionId: params.fraudSessionId,
        idempotencyScope: `book-${inv.id}`,
        buyer: {
          identityRef: result.contact.finixBuyerIdentityId,
          firstName: result.contact.firstName,
          lastName: result.contact.lastName,
          email: result.contact.email,
          phone: result.contact.phone,
        },
      });
      if (!charge.success) {
        await unwind(result);
        return { declined: true, error: charge.error };
      }
      if (charge.buyerIdentityRef && !result.contact.finixBuyerIdentityId) {
        await prisma.contact.update({ where: { id: result.contact.id }, data: { finixBuyerIdentityId: charge.buyerIdentityRef } }).catch(() => {});
      }
      await recordPayment({
        companyId: company.id,
        invoiceId: inv.id,
        amount,
        method: "CARD",
        processorRef: charge.transactionId,
        surchargeAmount,
        cardBrand: charge.cardBrand,
        cardType: charge.cardType,
        details: "Paid at online booking",
        receiptPending: charge.pending,
      });
      if (surchargeAmount > 0) {
        const cur = await prisma.invoice.findUnique({ where: { id: inv.id }, select: { surcharge: true } });
        await prisma.invoice.update({ where: { id: inv.id }, data: { surcharge: Math.round((Number(cur?.surcharge ?? 0) + surchargeAmount) * 100) / 100 } });
      }
      paidNote = `${type.paymentMode === "FULL" ? "Paid" : "Deposit paid"}: $${amount.toFixed(2)}${surchargeAmount > 0 ? ` + $${surchargeAmount.toFixed(2)} card fee` : ""}`;
    } finally {
      await releaseChargeLock(inv.id);
    }
  }

  // ── Notify ──────────────────────────────────────────────────────────────
  const assignee = await prisma.user.findUnique({ where: { id: result.assignedUserId }, select: { id: true, name: true } });
  const contactName = `${result.contact.firstName} ${result.contact.lastName}`.trim();
  const detailUrl = `${APP_URL}/app/jobs/${result.job.id}`;
  try {
    const targets = new Set(await companyManagerIds(company.id));
    if (assignee) targets.add(assignee.id);
    await notifyUsers([...targets], {
      title: "New booking",
      body: `${contactName} — ${title}, ${label}${paidNote ? ` · ${paidNote}` : ""}`,
      url: `/app/jobs/${result.job.id}`,
      tag: `job-${result.job.id}`,
    });
  } catch (err) {
    console.error("[booking] push failed:", err);
  }
  try {
    const notifyTo = await companyNotifyAddress(company.id, company.email);
    if (notifyTo) {
      const mail = bookingTeamNoticeEmail({
        companyName: company.name,
        event: "booked",
        serviceName: title,
        contactName,
        windowLabel: label,
        assigneeName: assignee?.name ?? null,
        detailUrl,
        paidNote,
      });
      await sendEmail({ companyId: company.id, to: notifyTo, subject: mail.subject, html: mail.html, replyTo: result.contact.email || undefined });
    }
  } catch (err) {
    console.error("[booking] team email failed:", err);
  }
  if (result.contact.email) {
    try {
      const mail = bookingConfirmedEmail({
        brand: company,
        companyName: company.name,
        companyEmail: company.email,
        contactFirstName: result.contact.firstName,
        serviceName: title,
        windowLabel: label,
        address: customer.address,
        extras: { exactTime: false, withName: assignee?.name ?? null, paidNote },
      });
      await sendEmail({
        companyId: company.id,
        to: result.contact.email,
        subject: mail.subject,
        html: mail.html,
        replyTo: company.email || undefined,
        fromName: company.name,
        attachments: [
          icsAttachment({
            uid: `${result.job.id}@workbenchfsm.com`,
            start: slot.start,
            end: slot.end,
            summary: `${title} — ${company.name}`,
            description: `Arrival window: ${label}`,
            location: customer.address,
            organizerName: company.name,
            organizerEmail: company.email,
          }),
        ],
      });
    } catch (err) {
      console.error("[booking] client email failed:", err);
    }
  }

  return {
    booking: {
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      windowEnd: slot.windowEnd.toISOString(),
      label,
      typeName: title,
      exactTime: false,
      tentative: false,
      withName: assignee?.name ?? null,
      meetingLink: null,
      manageUrl: null,
      address: customer.address,
      paidNote,
    },
  };
}

/**
 * A declined card releases the time: remove the job, quote, deposit invoice
 * and request the booking created. The contact stays — it's a real person
 * who may retry. Best-effort; leftovers are visible to the owner either way.
 */
async function unwind(r: { job: { id: string }; quote: { id: string }; request: { id: string }; depositInvoice: { invoice: { id: string } } | null }) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: r.quote.id }, data: { jobId: null, status: "ARCHIVED" } });
      if (r.depositInvoice) await tx.invoice.delete({ where: { id: r.depositInvoice.invoice.id } });
      await tx.job.delete({ where: { id: r.job.id } });
      await tx.quote.delete({ where: { id: r.quote.id } });
      await tx.request.delete({ where: { id: r.request.id } });
    });
  } catch (err) {
    console.error("[booking] unwind after decline failed:", err);
  }
}
