import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { sanitizeRecurringAndAgreement, sanitizeDuration, sanitizePriceDisplay } from "@/lib/work-items";
import { sanitizeDeposit } from "@/lib/deposits";
import { sanitizeChecklist } from "@/lib/job-checklist";

// Price-book edits are settings territory: managers only
async function getCompanyId() {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return null;
  return actor.companyId;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.workItem.findFirst({ where: { id, companyId } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const body = await req.json();

  // Recurring + agreement settings are revalidated together (the gate flag is
  // derived from the attached template, so it can't be patched independently).
  const recurring = await sanitizeRecurringAndAgreement(body, companyId);
  if ("error" in recurring) {
    return NextResponse.json({ error: recurring.error }, { status: 400 });
  }

  const updated = await prisma.workItem.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: String(body.name).trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.type !== undefined && { type: body.type === "PRODUCT" ? "PRODUCT" : "SERVICE" }),
      ...(body.unitPrice !== undefined && { unitPrice: Number(body.unitPrice) || 0 }),
      ...(body.unitCost !== undefined && {
        unitCost: body.unitCost === null || body.unitCost === "" ? null : Number(body.unitCost),
      }),
      ...(body.durationMinutes !== undefined && {
        durationMinutes: sanitizeDuration(body.durationMinutes),
      }),
      ...(body.checklist !== undefined && {
        checklist: sanitizeChecklist(body.checklist) ?? Prisma.DbNull,
      }),
      ...(body.priceDisplay !== undefined && {
        priceDisplay: sanitizePriceDisplay(body.priceDisplay),
      }),
      ...recurring.data,
      ...(body.depositType !== undefined && sanitizeDeposit(body)),
      // Archive/reactivate: inactive items vanish from pickers and booking
      // but history that references them stays intact.
      ...(body.isActive !== undefined && { isActive: body.isActive !== false }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const companyId = await getCompanyId();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.workItem.findFirst({ where: { id, companyId } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  // An item referenced by history (quote/invoice lines, subscriptions) is
  // ARCHIVED instead of deleted — a hard delete used to orphan those links
  // and quietly break the agreement gate and margin backfill on old docs.
  const [quoteRefs, invoiceRefs, subRefs] = await Promise.all([
    prisma.quoteLineItem.count({ where: { workItemId: id } }),
    prisma.invoiceLineItem.count({ where: { workItemId: id } }),
    prisma.subscription.count({ where: { workItemId: id } }),
  ]);
  if (quoteRefs + invoiceRefs + subRefs > 0) {
    await prisma.workItem.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ archived: true });
  }

  await prisma.workItem.delete({ where: { id } });
  return NextResponse.json({ success: true, deleted: true });
}
