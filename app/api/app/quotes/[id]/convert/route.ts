import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { convertQuoteToJob } from "@/lib/quote-convert";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";

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
  // Same preview cap as the direct-create path — converting creates a job too
  if (await inPreview(companyId)) {
    const n = await prisma.job.count({ where: { companyId } });
    if (n >= PREVIEW_CAP) return NextResponse.json(previewCapError("jobs"), { status: 403 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      contact: true,
      property: true,
      contracts: { select: { status: true } },
    },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.jobId) {
    return NextResponse.json({ error: "Quote was already converted." }, { status: 400 });
  }

  // Agreement gate: services flagged in the price book require a signed
  // agreement on this quote before work can start (client-removed optional
  // items don't count). Checked against the live price-book flag as well as
  // the snapshot so the gate can't be bypassed with a stale or doctored line.
  const activeItems = quote.lineItems.filter((li) => !(li.isOptional && li.optedOut));
  const workItemIds = activeItems
    .map((li) => li.workItemId)
    .filter((wid): wid is string => Boolean(wid));
  const gatedWorkItems = workItemIds.length
    ? await prisma.workItem.findMany({
        where: { id: { in: workItemIds }, companyId, requiresAgreement: true },
        select: { id: true },
      })
    : [];
  const gatedIds = new Set(gatedWorkItems.map((w) => w.id));
  const needsAgreement = activeItems.some(
    (li) => li.requiresAgreement || (li.workItemId && gatedIds.has(li.workItemId))
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

  // Shared with online service bookings — see lib/quote-convert.ts
  const job = await withDocNumberRetry(() => prisma.$transaction((tx) => convertQuoteToJob(tx, quote)));

  return NextResponse.json(job, { status: 201 });
}
