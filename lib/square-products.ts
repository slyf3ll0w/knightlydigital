import { squareFetch, SquareError, type SquareMoney } from "@/lib/square";
import { sumMoney, withSellerToken, type SellerRead } from "@/lib/square-seller-reports";

/**
 * Seller-token calls behind the Square products WorkBench builds natively
 * (2026-10-30, docs/plans/square-products-2026-10-30.md): the itemization
 * behind a payment (Orders API) and the transaction detail. Same discipline as
 * lib/square-seller-reports.ts — every call reads live with the
 * seller's OAuth token and answers a `SellerRead`, so a page renders what it
 * can when Square is down and says "Reconnect Square" when the grant
 * predates a scope. The mappers are pure (scripts/test-square-products.ts).
 */

const cents = (m: SquareMoney | undefined | null): number => (m?.amount != null ? Number(m.amount) : 0);

// ─── Orders (RetrieveOrder, ORDERS_READ) ────────────────────────────────────

export type SellerOrderLine = {
  uid: string | null;
  name: string;
  variation: string | null;
  quantity: number;
  unitCents: number;
  /** Line total after its discounts, before tax (Square's total_money minus total_tax_money). */
  totalCents: number;
  taxCents: number;
  discountCents: number;
  modifiers: { name: string; cents: number }[];
  note: string | null;
};

export type SellerOrder = {
  id: string;
  lines: SellerOrderLine[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  totalCents: number;
  serviceCharges: { name: string; cents: number }[];
  discounts: { name: string; cents: number }[];
  taxes: { name: string; cents: number }[];
  /** Where the order came from ("Square Point of Sale", "Square Online", an app name). */
  source: string | null;
  createdAt: string | null;
};

type SquareOrderRaw = {
  id: string;
  created_at?: string;
  source?: { name?: string };
  line_items?: {
    uid?: string;
    name?: string;
    variation_name?: string;
    quantity?: string;
    note?: string;
    base_price_money?: SquareMoney;
    gross_sales_money?: SquareMoney;
    total_money?: SquareMoney;
    total_tax_money?: SquareMoney;
    total_discount_money?: SquareMoney;
    modifiers?: { name?: string; total_price_money?: SquareMoney }[];
  }[];
  service_charges?: { name?: string; total_money?: SquareMoney }[];
  discounts?: { name?: string; applied_money?: SquareMoney; amount_money?: SquareMoney }[];
  taxes?: { name?: string; applied_money?: SquareMoney }[];
  total_money?: SquareMoney;
  total_tax_money?: SquareMoney;
  total_discount_money?: SquareMoney;
  total_tip_money?: SquareMoney;
  total_service_charge_money?: SquareMoney;
};

export function mapSellerOrder(o: SquareOrderRaw): SellerOrder {
  const lines: SellerOrderLine[] = (o.line_items ?? []).map((l) => {
    const total = cents(l.total_money);
    const tax = cents(l.total_tax_money);
    return {
      uid: l.uid ?? null,
      name: l.name?.trim() || "Item",
      variation: l.variation_name?.trim() || null,
      quantity: Number(l.quantity ?? "1") || 1,
      unitCents: cents(l.base_price_money),
      totalCents: total - tax,
      taxCents: tax,
      discountCents: cents(l.total_discount_money),
      modifiers: (l.modifiers ?? []).map((m) => ({ name: m.name?.trim() || "Option", cents: cents(m.total_price_money) })),
      note: l.note?.trim() || null,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.totalCents + l.discountCents, 0);
  return {
    id: o.id,
    lines,
    subtotalCents: subtotal,
    discountCents: cents(o.total_discount_money),
    taxCents: cents(o.total_tax_money),
    tipCents: cents(o.total_tip_money),
    serviceChargeCents: cents(o.total_service_charge_money),
    totalCents: cents(o.total_money),
    serviceCharges: (o.service_charges ?? []).map((c) => ({ name: c.name?.trim() || "Service charge", cents: cents(c.total_money) })),
    discounts: (o.discounts ?? []).map((d) => ({ name: d.name?.trim() || "Discount", cents: cents(d.applied_money ?? d.amount_money) })),
    taxes: (o.taxes ?? []).map((t) => ({ name: t.name?.trim() || "Tax", cents: cents(t.applied_money) })),
    source: o.source?.name?.trim() || null,
    createdAt: o.created_at ?? null,
  };
}

export async function retrieveSquareOrder(companyId: string, orderId: string): Promise<SellerRead<SellerOrder>> {
  return withSellerToken(companyId, "RetrieveOrder", async (token) => {
    const r = await squareFetch<{ order: SquareOrderRaw }>(`/v2/orders/${encodeURIComponent(orderId)}`, { auth: { bearer: token } });
    return mapSellerOrder(r.order);
  });
}

// ─── Payment detail (GetPayment + its refunds, PAYMENTS_READ) ───────────────

export type SellerRefund = {
  id: string;
  amountCents: number;
  status: string;
  reason: string | null;
  createdAt: string | null;
};

export type SellerPaymentDetail = {
  id: string;
  status: string;
  createdAt: string | null;
  amountCents: number;
  tipCents: number;
  totalCents: number;
  feeCents: number;
  refundedCents: number;
  sourceType: string | null;
  cardBrand: string | null;
  last4: string | null;
  cardType: string | null;
  entryMethod: string | null;
  bankName: string | null;
  note: string | null;
  referenceId: string | null;
  receiptUrl: string | null;
  receiptNumber: string | null;
  orderId: string | null;
  customerId: string | null;
  squareProduct: string | null;
  applicationId: string | null;
  refundIds: string[];
};

type SquarePaymentDetailRaw = {
  id: string;
  status: string;
  created_at?: string;
  amount_money?: SquareMoney;
  tip_money?: SquareMoney;
  total_money?: SquareMoney;
  processing_fee?: { amount_money?: SquareMoney }[];
  refunded_money?: SquareMoney;
  refund_ids?: string[];
  source_type?: string;
  card_details?: { entry_method?: string; card?: { card_brand?: string; last_4?: string; card_type?: string } };
  bank_account_details?: { bank_name?: string; ach_details?: { account_number_suffix?: string } };
  note?: string;
  reference_id?: string;
  receipt_url?: string;
  receipt_number?: string;
  order_id?: string;
  customer_id?: string;
  application_details?: { square_product?: string; application_id?: string };
};

export function mapSellerPaymentDetail(p: SquarePaymentDetailRaw): SellerPaymentDetail {
  return {
    id: p.id,
    status: p.status,
    createdAt: p.created_at ?? null,
    amountCents: cents(p.amount_money),
    tipCents: cents(p.tip_money),
    totalCents: p.total_money ? cents(p.total_money) : cents(p.amount_money) + cents(p.tip_money),
    feeCents: sumMoney(p.processing_fee),
    refundedCents: cents(p.refunded_money),
    sourceType: p.source_type ?? null,
    cardBrand: p.card_details?.card?.card_brand ?? null,
    last4: p.card_details?.card?.last_4 ?? p.bank_account_details?.ach_details?.account_number_suffix ?? null,
    cardType: p.card_details?.card?.card_type ?? null,
    entryMethod: p.card_details?.entry_method ?? null,
    bankName: p.bank_account_details?.bank_name ?? null,
    note: p.note?.trim() || null,
    referenceId: p.reference_id ?? null,
    receiptUrl: p.receipt_url ?? null,
    receiptNumber: p.receipt_number ?? null,
    orderId: p.order_id ?? null,
    customerId: p.customer_id ?? null,
    squareProduct: p.application_details?.square_product ?? null,
    applicationId: p.application_details?.application_id ?? null,
    refundIds: p.refund_ids ?? [],
  };
}

type SquareRefundRaw = { id: string; amount_money?: SquareMoney; status?: string; reason?: string; created_at?: string };

export function mapSellerRefund(r: SquareRefundRaw): SellerRefund {
  return { id: r.id, amountCents: cents(r.amount_money), status: r.status ?? "PENDING", reason: r.reason?.trim() || null, createdAt: r.created_at ?? null };
}

/** The payment, its refunds (first 10 by id) and, when it carries an order, the order. */
export async function retrieveSquareTransaction(
  companyId: string,
  paymentId: string
): Promise<SellerRead<{ payment: SellerPaymentDetail; refunds: SellerRefund[]; order: SellerOrder | null; orderError: string | null }>> {
  return withSellerToken(companyId, "GetPayment", async (token) => {
    const r = await squareFetch<{ payment: SquarePaymentDetailRaw }>(`/v2/payments/${encodeURIComponent(paymentId)}`, { auth: { bearer: token } });
    const payment = mapSellerPaymentDetail(r.payment);
    const refunds: SellerRefund[] = [];
    for (const id of payment.refundIds.slice(0, 10)) {
      try {
        const rr = await squareFetch<{ refund: SquareRefundRaw }>(`/v2/refunds/${encodeURIComponent(id)}`, { auth: { bearer: token } });
        refunds.push(mapSellerRefund(rr.refund));
      } catch {
        // One unreadable refund never hides the payment.
      }
    }
    let order: SellerOrder | null = null;
    let orderError: string | null = null;
    if (payment.orderId) {
      try {
        const or = await squareFetch<{ order: SquareOrderRaw }>(`/v2/orders/${encodeURIComponent(payment.orderId)}`, { auth: { bearer: token } });
        order = mapSellerOrder(or.order);
      } catch (err) {
        // A grant without ORDERS_READ answers 403 — the detail still shows the payment.
        orderError = err instanceof SquareError && err.status === 403 ? "missing_scope" : "unavailable";
      }
    }
    return { payment, refunds, order, orderError };
  });
}
