import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { sanitizeRecurringAndAgreement, sanitizeDuration, sanitizePriceDisplay } from "@/lib/work-items";
import { sanitizeDeposit } from "@/lib/deposits";
import { sanitizeChecklist } from "@/lib/job-checklist";
import { estimatorsUsingItem } from "@/lib/estimator-server";

/**
 * Estimate tools link price-book items BY NAME (lib/estimator.ts); renaming
 * or archiving an item they use would make every run of those tools fail —
 * including a published web form, in front of a visitor. Refuse with the
 * tool names so the owner changes the lines first.
 */
async function estimatorGuard(companyId: string, itemName: string, what: string): Promise<NextResponse | null> {
  const used = await estimatorsUsingItem(companyId, itemName);
  if (used.length === 0) return null;
  const names = used.map((t) => `“${t.name}”`).join(", ");
  return NextResponse.json(
    {
      error: `${what} — ${used.length === 1 ? "an estimate tool uses it" : `${used.length} estimate tools use it`}: ${names}. Change those pricing lines first (Estimates → the tool → Advanced → Pricing).`,
      estimators: used,
    },
    { status: 409 }
  );
}

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

  const renaming = body.name !== undefined && String(body.name).trim().toLowerCase() !== item.name.trim().toLowerCase();
  const archiving = body.isActive !== undefined && body.isActive === false && item.isActive;
  if (renaming || archiving) {
    const blocked = await estimatorGuard(companyId, item.name, renaming ? `“${item.name}” can't be renamed yet` : `“${item.name}” can't be archived yet`);
    if (blocked) return blocked;
  }

  // Recurring + agreement settings are revalidated together (the gate flag is
  // derived from the attached template, so it can't be patched independently)
  // — but only when the PATCH is actually about them. The sanitizer fills in
  // nulls/false for every key it doesn't see, so running it on a bare
  // `{ isActive: true }` (reactivating an archived service) used to wipe the
  // item's cadence and agreement template on the way past.
  const RECURRING_AGREEMENT_KEYS = [
    "recurringInterval",
    "recurringCreatesJob",
    "recurringInvoiceMode",
    "agreementTemplateId",
    "agreementTiming",
    "requiresAgreement",
  ] as const;
  const touchesRecurring = RECURRING_AGREEMENT_KEYS.some((k) => body[k] !== undefined);
  const recurring = touchesRecurring
    ? await sanitizeRecurringAndAgreement(body, companyId)
    : { data: {} };
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

  const blocked = await estimatorGuard(companyId, item.name, `“${item.name}” can't be deleted yet`);
  if (blocked) return blocked;

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
