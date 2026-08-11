import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { RecurringInterval } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, contactScope } from "@/lib/permissions";
import { recordLeadWin } from "@/lib/pipeline";
import { ensureSubscriptionsForContact } from "@/lib/subscriptions";
import { paidDepositTotal } from "@/lib/deposits";
import { intQuantity, unitPriceValue, resolveLineItemCosts } from "@/lib/work-items";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { withDocNumberRetry } from "@/lib/doc-numbers";

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  if (await inPreview(companyId))
    return NextResponse.json(previewBlockedError("Invoicing"), { status: 403 });

  const body = await req.json();
  const { contactId, jobId, subject, lineItems, taxRate, notes, clientMessage, dueDate } = body;

  if (!lineItems?.length) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }
  for (const li of lineItems) {
    li.quantity = intQuantity(li.quantity);
    li.unitPrice = unitPriceValue(li.unitPrice);
  }
  const typedLineItems = lineItems as {
    name?: string;
    description: string;
    quantity: number;
    unitCost?: number | null;
    unitPrice: number;
    serviceDate?: string;
    workItemId?: string | null;
    recurringInterval?: RecurringInterval | null;
    sortOrder?: number;
  }[];
  // Cost basis for margin reporting — the job's own line items first (they
  // carried cost through quote→job), then the linked price-book item, then a
  // name match. Clients never see it.
  if (jobId) {
    const jobLines = await prisma.jobLineItem.findMany({
      where: { job: { id: jobId, companyId } },
      select: { name: true, unitCost: true },
    });
    const costByName = new Map(
      jobLines
        .filter((jl) => jl.unitCost != null)
        .map((jl) => [jl.name.trim().toLowerCase(), Number(jl.unitCost)])
    );
    for (const li of typedLineItems) {
      if (li.unitCost == null) {
        const cost = costByName.get((li.name ?? "").trim().toLowerCase());
        if (cost !== undefined) li.unitCost = cost;
      }
    }
  }
  const costedLineItems = await resolveLineItemCosts(companyId, typedLineItems);

  const contact = contactId
    ? await prisma.contact.findFirst({ where: { id: contactId, companyId, ...contactScope(actor) } })
    : null;
  if (contactId && !contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }
  if (jobId) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, companyId },
      select: {
        id: true,
        jobNumber: true,
        consolidatedInvoiceId: true,
        invoice: { select: { invoiceNumber: true } },
        subscription: { select: { name: true, interval: true, billPerVisit: true } },
      },
    });
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
    // One invoice per job (Invoice.jobId is unique) — say so instead of
    // letting the create fail with a bare 500 and lose the typed line items.
    if (job.invoice) {
      return NextResponse.json(
        {
          error: `Job #${job.jobNumber} is already invoiced (invoice #${job.invoice.invoiceNumber}). Edit that invoice instead of creating a second one.`,
        },
        { status: 409 }
      );
    }
    // A visit already billed on a consolidated invoice has invoice == null but
    // consolidatedInvoiceId set — invoicing it again bills the client twice.
    if (job.consolidatedInvoiceId) {
      return NextResponse.json(
        {
          error: `Job #${job.jobNumber} was already billed on a consolidated recurring invoice. Invoicing it again would charge the client twice.`,
        },
        { status: 409 }
      );
    }
    // Plan-billed recurring work (interval set, not per-visit) is invoiced by
    // its billing cycle — a manual invoice on top double-bills the same work.
    if (job.subscription?.interval && !job.subscription.billPerVisit) {
      return NextResponse.json(
        {
          error: `Job #${job.jobNumber} belongs to the recurring plan "${job.subscription.name}", which bills it automatically. Invoicing it again would charge the client twice.`,
        },
        { status: 409 }
      );
    }
  }

  const subtotal = lineItems.reduce(
    (s: number, li: { quantity: number; unitPrice: number }) => s + li.quantity * li.unitPrice,
    0
  );
  // Shared quote/invoice math (lib/quote-totals) — tax rounds to cents, so a
  // quoted total survives invoicing exactly instead of drifting by fractions.
  const discountType = body.discountType === "PERCENT" || body.discountType === "FIXED" ? body.discountType : "NONE";
  const discountValue = Number(body.discountValue) || 0;
  const { discount, tax, total } = computeQuoteTotals({
    subtotal,
    discountType,
    discountValue,
    taxRate: taxRate || null,
  });

  // Due date from explicit value, else the client's payment terms (Net N).
  // Date-only strings get anchored to midday so they don't shift a day in
  // timezone conversion.
  const issuedAt = new Date();
  const due = dueDate
    ? new Date(dueDate.length === 10 ? `${dueDate}T12:00:00` : dueDate)
    : contact
      ? new Date(issuedAt.getTime() + contact.paymentTermsDays * 86400000)
      : null;

  // Wrapped so a concurrent invoice create in the same company re-derives the
  // number instead of 500ing and losing everything the user typed.
  const invoice = await withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    const last = await tx.invoice.findFirst({
      where: { companyId },
      orderBy: { invoiceNumber: "desc" },
    });

    // A final invoice for a job nets any deposit already paid on the job's quote,
    // so the client isn't billed twice. `total` is stored net; depositApplied
    // drives the "Deposit applied" credit line on the invoice.
    let depositApplied = 0;
    if (jobId) {
      const quote = await tx.quote.findFirst({ where: { jobId, companyId }, select: { id: true } });
      if (quote) {
        depositApplied = Math.min(await paidDepositTotal(tx, quote.id), total);
        // Retire any NEVER-PAID deposit invoice for this quote — it's superseded
        // by this final invoice, which bills the full remaining scope. Leaving it
        // outstanding would bill AND dun the client twice for the deposit. Only
        // touch deposit invoices with zero payments; anything with payment
        // history is left intact (its paid amount is already netted above).
        const staleDeposits = await tx.invoice.findMany({
          where: { quoteId: quote.id, kind: "DEPOSIT", status: { not: "PAID" }, payments: { none: {} } },
          select: { id: true },
        });
        if (staleDeposits.length > 0) {
          const ids = staleDeposits.map((d) => d.id);
          await tx.invoiceLineItem.deleteMany({ where: { invoiceId: { in: ids } } });
          await tx.invoice.deleteMany({ where: { id: { in: ids } } });
        }
      }
    }
    const netTotal = Math.round((total - depositApplied) * 100) / 100;

    const created = await tx.invoice.create({
      data: {
        companyId,
        contactId: contactId || null,
        jobId: jobId || null,
        publicToken: randomBytes(24).toString("hex"),
        invoiceNumber: (last?.invoiceNumber ?? 0) + 1,
        subject: subject || null,
        subtotal,
        discountType,
        discountValue: discount > 0 ? discountValue : null,
        discount: discount > 0 ? discount : null,
        taxRate: taxRate || null,
        tax,
        depositApplied: depositApplied > 0 ? depositApplied : null,
        total: netTotal,
        notes: notes || null,
        clientMessage: typeof clientMessage === "string" && clientMessage ? clientMessage : null,
        issuedAt,
        dueDate: due,
        lineItems: {
          create: costedLineItems.map(
            (li: {
              name?: string;
              description: string;
              quantity: number;
              unitCost?: number | null;
              unitPrice: number;
              serviceDate?: string;
              workItemId?: string | null;
              recurringInterval?: RecurringInterval | null;
              sortOrder?: number;
            }) => ({
              name: li.name ?? "",
              description: li.description ?? "",
              quantity: li.quantity,
              unitCost: li.unitCost ?? null,
              unitPrice: li.unitPrice,
              total: li.quantity * li.unitPrice,
              serviceDate: li.serviceDate ? new Date(li.serviceDate) : null,
              workItemId: li.workItemId ?? null,
              recurringInterval: li.recurringInterval ?? null,
              sortOrder: li.sortOrder ?? 0,
            })
          ),
        },
      },
    });

    // Invoicing a completed job resolves its "requires invoicing" state
    if (jobId) {
      const job = await tx.job.findFirst({ where: { id: jobId, companyId } });
      if (job?.status === "REQUIRES_INVOICING") {
        await tx.job.update({
          where: { id: jobId },
          data: { status: "ARCHIVED", closedAt: new Date() },
        });
      }
    }

    // Billing a lead closes them: active client, off the pipeline board
    if (contact) {
      await recordLeadWin(tx, companyId, contact);
    }

    // Recurring services billed directly also start a subscription
    if (contact) {
      await ensureSubscriptionsForContact(
        tx,
        companyId,
        contact.id,
        (lineItems as { workItemId?: string | null; quantity?: number }[]).map((li) => ({
          workItemId: li.workItemId,
          quantity: Number(li.quantity) || 1,
        }))
      );
    }

    return created;
  }));

  return NextResponse.json(invoice, { status: 201 });
}
