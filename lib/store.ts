import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { resolvePublicCompany } from "@/lib/public-company";
import { appearanceFor } from "@/app/book/[slug]/schedule/shell";
import { nextInvoiceNumber, withDocNumberRetry } from "@/lib/doc-numbers";
import { phoneDigits } from "@/lib/phone";
import { defaultLeadAssignee } from "@/lib/permissions";
import { reportError } from "@/lib/report-error";
import {
  orderAmountIssue,
  orderTotals,
  STORE_NOTE_MAX,
  STORE_ORDER_HOLD_HOURS,
  storeBuyerIssue,
  storeOrderSubject,
  storeQuantityIssue,
  type StoreBuyer,
} from "@/lib/store-rules";

/**
 * The online store, lane 1 (2026-10-31, docs/plans/online-store-2026-10-31.md).
 * A business flips "Sell online" on a PRODUCT in its price book and the
 * product is on its shop page (/book/<slug>/shop) with a buy link of its
 * own. A purchase is the ordinary money path: the buyer becomes (or already
 * is) a client, an `InvoiceKind.STORE_ORDER` invoice carries the line, and
 * the buyer lands on the pay page — card, bank or gift card, service fee
 * and all. A paid invoice IS the order: it shows on Invoices, Payments,
 * reports and the client's hub like any other, and the team gets the usual
 * payment notification. Orders nobody pays archive after
 * STORE_ORDER_HOLD_HOURS so the invoice list isn't a graveyard of carts.
 * Not here (lane 2+): a cart, shipping or pickup, stock counts, variants,
 * an embeddable widget for the client's own website.
 */

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type StoreProduct = { id: string; name: string; description: string | null; unitPrice: number; photoUrl: string | null };

const PRODUCT_SELECT = { id: true, name: true, description: true, unitPrice: true, photoKey: true } as const;

/** The public image route for a product's photo (null without one). */
export function storePhotoUrl(item: { id: string; photoKey: string | null }): string | null {
  return item.photoKey ? `/api/public/store-photos/${item.id}` : null;
}

function toProduct(i: { id: string; name: string; description: string | null; unitPrice: { toString(): string } | number; photoKey: string | null }): StoreProduct {
  return { id: i.id, name: i.name, description: i.description, unitPrice: Number(i.unitPrice), photoUrl: storePhotoUrl(i) };
}

/** Everything the company sells online, in name order. */
export async function storeProducts(companyId: string): Promise<StoreProduct[]> {
  const rows = await prisma.workItem.findMany({
    where: { companyId, isActive: true, type: "PRODUCT", sellOnline: true },
    orderBy: { name: "asc" },
    select: PRODUCT_SELECT,
  });
  return rows.map(toProduct);
}

/** The shop page: the public company (same gate as /book) + its look + products. */
export async function loadStore(companySlug: string) {
  const company = await resolvePublicCompany(companySlug);
  if (!company) return null;
  const products = await storeProducts(company.id);
  return { company, appearance: appearanceFor(company), products };
}

/** One product's page; null when it isn't for sale. */
export async function loadStoreProduct(companySlug: string, itemId: string) {
  const company = await resolvePublicCompany(companySlug);
  if (!company) return null;
  const row = await prisma.workItem.findFirst({
    where: { id: itemId, companyId: company.id, isActive: true, type: "PRODUCT", sellOnline: true },
    select: PRODUCT_SELECT,
  });
  if (!row) return null;
  return { company, appearance: appearanceFor(company), product: toProduct(row), taxRate: company.defaultTaxRate == null ? null : Number(company.defaultTaxRate) };
}

export type StoreOrderResult = { invoiceId: string; invoiceNumber: number; publicToken: string; total: number; contactId: string };

/**
 * A buyer's purchase → a client (matched by phone or email, else made) and
 * an AWAITING_PAYMENT STORE_ORDER invoice for quantity × the product's
 * price plus the company's default sales tax. The pay page does the rest.
 */
export async function createStoreOrder(params: {
  companySlug: string;
  itemId: string;
  quantity: number;
  buyer: StoreBuyer;
  note?: string | null;
  /** A client ordering from their own hub (hub token checked by the route): no matching, no new record. */
  contactId?: string | null;
}): Promise<StoreOrderResult> {
  const company = await resolvePublicCompany(params.companySlug);
  if (!company) throw new StoreError("Shop not found.", 404);
  const product = await prisma.workItem.findFirst({
    where: { id: params.itemId, companyId: company.id, isActive: true, type: "PRODUCT", sellOnline: true },
    select: PRODUCT_SELECT,
  });
  if (!product) throw new StoreError("That product isn't for sale right now.", 404);
  const qIssue = storeQuantityIssue(params.quantity);
  if (qIssue) throw new StoreError(qIssue);
  // A client ordering from their hub is already on file — no email demanded
  // (the receipt goes wherever their record says); a stranger needs one.
  const bIssue = params.contactId ? null : storeBuyerIssue(params.buyer);
  if (bIssue) throw new StoreError(bIssue);

  const quantity = Math.floor(params.quantity);
  const taxRate = company.defaultTaxRate == null ? null : Number(company.defaultTaxRate);
  const totals = orderTotals({ unitPrice: Number(product.unitPrice), quantity, taxRate });
  const aIssue = orderAmountIssue(totals.total);
  if (aIssue) throw new StoreError(aIssue);

  const firstName = params.buyer.firstName.trim().slice(0, 80);
  const lastName = params.buyer.lastName.trim().slice(0, 80);
  const email = params.buyer.email.trim().toLowerCase().slice(0, 200);
  const phone = params.buyer.phone.trim().slice(0, 40);
  const note = (params.note ?? "").trim().slice(0, STORE_NOTE_MAX) || null;
  const assignedToId = await defaultLeadAssignee(company.id);
  const now = new Date();

  const made = await withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      // The buyer is probably already a client — never a second record for them.
      let contact = params.contactId
        ? await tx.contact.findFirst({ where: { id: params.contactId, companyId: company.id }, select: { id: true, email: true, phone: true } })
        : await tx.contact.findFirst({
            // Only a real, current record: a `placeholder` (a number the team
            // once texted, no name, no email) or an ARCHIVED contact matched on
            // the phone would swallow the order — the typed name and email are
            // discarded and the receipt has nowhere to go.
            where: {
              companyId: company.id,
              placeholder: false,
              status: { not: "ARCHIVED" },
              OR: [...(phoneDigits(phone) ? [{ phoneDigits: phoneDigits(phone) }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])],
            },
            select: { id: true, email: true, phone: true },
          });
      if (params.contactId && !contact) throw new StoreError("Client not found.", 404);
      if (contact) {
        // A signed-in hub client filling their own blanks is fine. A stranger
        // who merely typed a client's email must NOT be able to write a phone
        // number onto that client's record (security audit 2026-11-01) — the
        // texts and calls meant for the client would go to the stranger.
        const fill = params.contactId ? { ...(!contact.email && email ? { email } : {}), ...(!contact.phone && phone ? { phone } : {}) } : {};
        if (Object.keys(fill).length > 0) contact = await tx.contact.update({ where: { id: contact.id }, data: fill, select: { id: true, email: true, phone: true } });
      } else {
        contact = await tx.contact.create({
          data: {
            companyId: company.id,
            hubToken: randomBytes(24).toString("hex"),
            firstName,
            lastName,
            email,
            phone: phone || null,
            leadSource: "Online store",
            assignedToId,
          },
          select: { id: true, email: true, phone: true },
        });
      }
      const invoiceNumber = await nextInvoiceNumber(tx, company.id);
      const invoice = await tx.invoice.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          publicToken: randomBytes(24).toString("hex"),
          kind: "STORE_ORDER",
          invoiceNumber,
          subject: storeOrderSubject(product.name, quantity),
          status: "AWAITING_PAYMENT",
          subtotal: totals.subtotal,
          taxRate: totals.tax > 0 ? taxRate : null,
          tax: totals.tax > 0 ? totals.tax : null,
          total: totals.total,
          clientMessage: note,
          issuedAt: now,
          dueDate: now,
          lineItems: {
            create: [{ name: product.name, description: product.description ?? "", quantity, unitPrice: Number(product.unitPrice), total: totals.subtotal, workItemId: product.id, sortOrder: 0 }],
          },
        },
        select: { id: true, invoiceNumber: true, publicToken: true },
      });
      return { invoice, contactId: contact.id };
    })
  );
  return { invoiceId: made.invoice.id, invoiceNumber: made.invoice.invoiceNumber, publicToken: made.invoice.publicToken, total: totals.total, contactId: made.contactId };
}

/** Cron: orders nobody paid within the hold window are archived (no payments, still awaiting). */
export async function runStoreOrderSweep(now = new Date()): Promise<number> {
  try {
    const cutoff = new Date(now.getTime() - STORE_ORDER_HOLD_HOURS * 3600_000);
    // Both open states: the reminders sweep used to flip an unpaid order to
    // PAST_DUE the morning after it was placed, which this match on
    // AWAITING_PAYMENT alone never caught — abandoned carts lived forever
    // (readiness review 2026-11-02, #3). Store orders are now kept out of
    // the past-due flip and the payment reminders too (lib/reminders.ts).
    const r = await prisma.invoice.updateMany({
      where: { kind: "STORE_ORDER", status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] }, issuedAt: { lt: cutoff }, payments: { none: {} } },
      data: { status: "ARCHIVED" },
    });
    return r.count;
  } catch (err) {
    reportError("[store] order sweep failed", err);
    return 0;
  }
}
