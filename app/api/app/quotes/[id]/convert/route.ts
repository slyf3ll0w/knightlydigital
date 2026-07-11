import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { ensureSubscriptionsForContact } from "@/lib/subscriptions";
import { recordLeadWin } from "@/lib/pipeline";

/**
 * POST — convert an approved quote into a job (Jobber's "Convert to Job").
 * Copies line items (skipping client-removed optional items), carries the
 * request link forward, and marks the quote Converted.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      contact: true,
      contracts: { select: { status: true } },
    },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.jobId) {
    return NextResponse.json({ error: "Quote was already converted." }, { status: 400 });
  }

  // Agreement gate: services flagged in the price book require a signed
  // agreement on this quote before work can start (client-removed optional
  // items don't count)
  const needsAgreement = quote.lineItems.some(
    (li) => li.requiresAgreement && !(li.isOptional && li.optedOut)
  );
  if (needsAgreement && !quote.contracts.some((c) => c.status === "SIGNED")) {
    const pending = quote.contracts.some((c) => c.status === "SENT");
    return NextResponse.json(
      {
        error: pending
          ? "This quote includes services that require a signed agreement — it's been sent, but the client hasn't signed yet."
          : "This quote includes services that require a signed agreement. Send the agreement first.",
        agreementRequired: true,
      },
      { status: 400 }
    );
  }

  const job = await prisma.$transaction(async (tx) => {
    const last = await tx.job.findFirst({
      where: { companyId },
      orderBy: { jobNumber: "desc" },
    });

    const created = await tx.job.create({
      data: {
        companyId,
        contactId: quote.contactId,
        requestId: quote.requestId,
        jobNumber: (last?.jobNumber ?? 0) + 1,
        title: quote.title || `Job for ${quote.contact.firstName} ${quote.contact.lastName}`,
        leadSource: quote.contact.leadSource,
        address: quote.contact.address,
        lineItems: {
          create: quote.lineItems
            .filter((li) => !(li.isOptional && li.optedOut))
            .map((li, i) => ({
              name: li.name,
              description: li.description || null,
              quantity: li.quantity,
              unitCost: li.unitCost,
              unitPrice: li.unitPrice,
              total: li.total,
              sortOrder: i,
            })),
        },
      },
    });

    await tx.quote.update({
      where: { id: quote.id },
      data: { jobId: created.id, status: "CONVERTED" },
    });

    // Recurring services on the quote become live subscriptions on the client
    await ensureSubscriptionsForContact(
      tx,
      companyId,
      quote.contactId,
      quote.lineItems
        .filter((li) => !(li.isOptional && li.optedOut))
        .map((li) => ({ workItemId: li.workItemId, quantity: Number(li.quantity) }))
    );

    // First real work closes the lead: active client, off the pipeline board
    await recordLeadWin(tx, quote.contact);

    return created;
  });

  return NextResponse.json(job, { status: 201 });
}
