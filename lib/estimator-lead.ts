import { randomBytes } from "crypto";
import { prisma } from "./db";
import { withDocNumberRetry } from "./doc-numbers";
import { upsertBookingContact } from "./booking-submit";
import { enterPipeline, autoAdvance } from "./pipeline";
import { fireAutomations } from "./automations-server";
import { notifyUsers, requestNotifyUserIds } from "./push";
import { companyNotifyAddress } from "./notify";
import { sendEmail, newRequestEmail, quoteLinkEmail } from "./email";
import { derivedQuoteDeposit } from "./statuses";
import type { EstimatorRun } from "./estimator";
import type { PublicEstimator } from "./estimator-server";
import { estimateLabel, shapeEstimate, type PublicEstimate } from "./estimator-public";

/**
 * The write side of a website estimate form (lib/estimator-public.ts): a
 * validated submission becomes a contact (matched or new lead), a Request,
 * and — unless the form is "request only" — a Quote built from the tool's
 * lines, drafted or sent for approval. Then the same after-commit fan-out
 * the booking form does: automations, push, company email, quote link.
 */

const APP_URL = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";

export type EstimateCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  message: string;
  /** undefined when the form didn't ask for a phone */
  smsConsent?: boolean;
};

export type EstimateLeadInput = {
  pub: PublicEstimator;
  result: Extract<EstimatorRun, { ok: true }>;
  /** "Driveway size: 800 sq ft" — the answers as the request will record them */
  answers: string[];
  customer: EstimateCustomer;
};

export type EstimateLeadResult = {
  requestId: string;
  quoteId: string | null;
  quoteNumber: number | null;
  /** What the visitor is shown on the thank-you screen (shaped by showPrice) */
  estimate: PublicEstimate;
};

const cents = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export async function createEstimateLead(input: EstimateLeadInput): Promise<EstimateLeadResult> {
  const { pub, result, answers, customer } = input;
  const { company, row, spec, config } = pub;
  const send = config.onSubmit === "send";
  const makeQuote = config.onSubmit !== "request";
  const title = (result.title || row.name).slice(0, 200);
  const estimate = shapeEstimate(result, config, spec.minimumTotal);
  const shown = estimateLabel(estimate);

  const out = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const contact = await upsertBookingContact(tx, company.id, {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone || null,
        address: customer.address || null,
        notes: null,
        smsConsent: customer.phone ? customer.smsConsent === true : undefined,
        leadSource: "Website estimate",
      });

      let quote: { id: string; quoteNumber: number; publicToken: string; total: number; deposit: number } | null = null;
      if (makeQuote) {
        const workItemIds = result.lines.map((l) => l.workItemId).filter((id): id is string => Boolean(id));
        const wi = workItemIds.length
          ? await tx.workItem.findMany({
              where: { id: { in: workItemIds }, companyId: company.id },
              select: { id: true, recurringInterval: true, depositType: true, depositValue: true, requiresAgreement: true },
            })
          : [];
        const wiById = new Map(wi.map((w) => [w.id, w] as const));
        // App convention (POST /api/app/quotes): the subtotal counts every line, optional ones included
        const subtotal = cents(result.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
        const deposit = derivedQuoteDeposit(
          result.lines.map((l) => {
            const w = l.workItemId ? wiById.get(l.workItemId) : undefined;
            return {
              total: cents(l.quantity * l.unitPrice),
              deposit: w ? { depositType: w.depositType, depositValue: w.depositValue } : null,
            };
          }),
          subtotal,
          { depositType: company.defaultDepositType, depositValue: company.defaultDepositValue }
        );
        const lastQuote = await tx.quote.findFirst({ where: { companyId: company.id }, orderBy: { quoteNumber: "desc" }, select: { quoteNumber: true } });
        const created = await tx.quote.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            publicToken: randomBytes(24).toString("hex"),
            quoteNumber: (lastQuote?.quoteNumber ?? 0) + 1,
            title,
            status: send ? "AWAITING_RESPONSE" : "DRAFT",
            subtotal,
            total: subtotal,
            depositType: deposit > 0 ? "FIXED" : "NONE",
            depositValue: deposit > 0 ? deposit : null,
            clientMessage: result.clientMessage?.slice(0, 2000) || null,
            sentAt: send ? new Date() : null,
            lineItems: {
              create: result.lines.map((l, i) => {
                const w = l.workItemId ? wiById.get(l.workItemId) : undefined;
                return {
                  name: l.name.slice(0, 200),
                  description: l.description.slice(0, 1000),
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  unitCost: l.unitCost ?? null,
                  total: cents(l.quantity * l.unitPrice),
                  workItemId: w?.id ?? null,
                  recurringInterval: w?.recurringInterval ?? null,
                  requiresAgreement: w?.requiresAgreement ?? false,
                  isOptional: l.isOptional,
                  sortOrder: i,
                };
              }),
            },
          },
          select: { id: true, quoteNumber: true, publicToken: true },
        });
        quote = { ...created, total: subtotal, deposit };
      }

      const last = await tx.request.findFirst({ where: { companyId: company.id }, orderBy: { requestNumber: "desc" }, select: { requestNumber: true } });
      const request = await tx.request.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          requestNumber: (last?.requestNumber ?? 0) + 1,
          title,
          details: [
            customer.message ? `Message: ${customer.message}` : null,
            answers.length ? `Answers:\n${answers.map((a) => `  • ${a}`).join("\n")}` : null,
            `Estimate: $${result.subtotal.toFixed(2)}${
              config.showPrice === "hidden" ? " (not shown to the client)" : config.showPrice === "range" ? ` (shown as ${shown})` : " (shown to the client)"
            }`,
            quote ? `Quote #${quote.quoteNumber} created automatically (${send ? "sent for approval" : "draft"})${quote.deposit > 0 ? ` — deposit $${quote.deposit.toFixed(2)}` : ""}.` : null,
            customer.address ? `Address: ${customer.address}` : null,
            `Form: ${row.name} (website estimate)`,
          ]
            .filter(Boolean)
            .join("\n"),
          source: "estimate_form",
          estimatorId: row.id,
        },
        select: { id: true, requestNumber: true, title: true, details: true },
      });
      if (quote) await tx.quote.update({ where: { id: quote.id }, data: { requestId: request.id } });

      await enterPipeline(tx, company.id, contact.id);
      await autoAdvance(tx, company.id, contact.id, "REQUEST_CREATED");
      if (quote && send) await autoAdvance(tx, company.id, contact.id, "QUOTE_SENT");

      await tx.estimator.update({ where: { id: row.id }, data: { submissions: { increment: 1 } } });
      return { contact, request, quote };
    })
  );

  fireAutomations(company.id, "request.created", out.request.id);
  if (out.quote && send) fireAutomations(company.id, "quote.sent", out.quote.id);

  const contactName = `${customer.firstName} ${customer.lastName}`.trim();
  try {
    await notifyUsers(await requestNotifyUserIds(company.id, out.contact.assignedToId), {
      title: `New estimate request from ${contactName}`,
      body: `${out.request.title}${shown ? ` — ${shown}` : ""}`,
      url: `/app/requests/${out.request.id}`,
      tag: `request-${out.request.id}`,
    });
  } catch (err) {
    console.error("[estimate-form] push failed:", err);
  }

  try {
    const notifyTo = await companyNotifyAddress(company.id, company.email);
    if (notifyTo) {
      const { subject, html } = newRequestEmail({
        companyName: company.name,
        requestId: out.request.id,
        requestNumber: out.request.requestNumber,
        title: out.request.title,
        details: out.request.details,
        contactName,
        contactPhone: customer.phone || null,
        contactEmail: customer.email || null,
        source: "booking_form",
      });
      await sendEmail({ companyId: company.id, to: notifyTo, subject, html, replyTo: customer.email || undefined });
    }
  } catch (err) {
    console.error("[estimate-form] team email failed:", err);
  }

  if (out.quote && send && customer.email) {
    try {
      const { subject, html } = quoteLinkEmail({
        brand: company,
        companyName: company.name,
        quoteNumber: out.quote.quoteNumber,
        total: out.quote.total,
        viewUrl: `${APP_URL}/quote/${out.quote.publicToken}`,
        serviceNames: result.lines.filter((l) => !l.isOptional).map((l) => l.name),
        depositNote: out.quote.deposit > 0 ? `A deposit of $${out.quote.deposit.toFixed(2)} will be due on approval.` : undefined,
      });
      await sendEmail({ companyId: company.id, to: customer.email, subject, html, replyTo: company.email || undefined, fromName: company.name });
    } catch (err) {
      console.error("[estimate-form] quote email failed:", err);
    }
  }

  return { requestId: out.request.id, quoteId: out.quote?.id ?? null, quoteNumber: out.quote?.quoteNumber ?? null, estimate };
}
