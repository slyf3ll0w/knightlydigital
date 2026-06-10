import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * POST — convert an approved quote into a job (Jobber's "Convert to Job").
 * Copies line items (skipping client-removed optional items), carries the
 * request link forward, and marks the quote Converted.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const companyId = session?.user.companyId;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quote = await prisma.quote.findFirst({
    where: { id, companyId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, contact: true },
  });
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.jobId) {
    return NextResponse.json({ error: "Quote was already converted." }, { status: 400 });
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

    // First real work for a lead makes them an active client (Jobber behavior)
    if (quote.contact.status === "LEAD") {
      await tx.contact.update({ where: { id: quote.contactId }, data: { status: "ACTIVE" } });
    }

    return created;
  });

  return NextResponse.json(job, { status: 201 });
}
