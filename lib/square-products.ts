import { createHash } from "crypto";
import { squareFetch, SquareError, type SquareMoney } from "@/lib/square";
import { qs, sumMoney, withSellerToken, type SellerRead } from "@/lib/square-seller-reports";

/**
 * Seller-token calls behind the Square products WorkBench builds natively
 * (2026-10-30, docs/plans/square-products-2026-10-30.md): the itemization
 * behind a payment (Orders API), gift cards (Gift Cards + Gift Card
 * Activities APIs) and the loyalty program (Loyalty API). Same discipline as
 * lib/square-seller-reports.ts — every call reads or writes live with the
 * seller's OAuth token and answers a `SellerRead`, so a page renders what it
 * can when Square is down and says "Reconnect Square" when the grant
 * predates a scope. The mappers are pure (scripts/test-square-products.ts).
 */

const cents = (m: SquareMoney | undefined | null): number => (m?.amount != null ? Number(m.amount) : 0);
const money = (amountCents: number, currency = "USD"): SquareMoney => ({ amount: Math.round(amountCents), currency });

/** Square idempotency keys are ≤45 chars; ours name the row they belong to. */
export function productIdempotencyKey(raw: string): string {
  return raw.length <= 45 ? raw : createHash("sha256").update(raw).digest("hex").slice(0, 45);
}

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

// ─── Gift cards (GIFTCARDS_READ / GIFTCARDS_WRITE) ─────────────────────────

export type GiftCardState = "ACTIVE" | "PENDING" | "DEACTIVATED" | "BLOCKED" | string;

export type SellerGiftCard = {
  id: string;
  gan: string | null;
  type: "DIGITAL" | "PHYSICAL" | string;
  state: GiftCardState;
  balanceCents: number;
  customerIds: string[];
  createdAt: string | null;
};

type SquareGiftCardRaw = {
  id: string;
  gan?: string;
  type?: string;
  state?: string;
  balance_money?: SquareMoney;
  customer_ids?: string[];
  created_at?: string;
};

export function mapSellerGiftCard(g: SquareGiftCardRaw): SellerGiftCard {
  return {
    id: g.id,
    gan: g.gan ?? null,
    type: g.type ?? "DIGITAL",
    state: g.state ?? "PENDING",
    balanceCents: cents(g.balance_money),
    customerIds: g.customer_ids ?? [],
    createdAt: g.created_at ?? null,
  };
}

/** "•••• 1234" — the last four of a gift card number, for lists and receipts. */
export function ganTail(gan: string | null | undefined): string {
  const digits = (gan ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

/** The number as the recipient reads it: groups of four. */
export function formatGan(gan: string | null | undefined): string {
  const digits = (gan ?? "").replace(/\D/g, "");
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** What the client typed → the digits Square wants (16 for Square cards; any 10–20 digit run is passed through). */
export function normalizeGan(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 20 ? digits : null;
}

export async function listSquareGiftCards(
  companyId: string,
  params: { cursor?: string | null; customerId?: string | null; state?: GiftCardState | null; limit?: number } = {}
): Promise<SellerRead<{ giftCards: SellerGiftCard[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListGiftCards", async (token) => {
    const r = await squareFetch<{ gift_cards?: SquareGiftCardRaw[]; cursor?: string }>(
      `/v2/gift-cards${qs({
        cursor: params.cursor ?? undefined,
        customer_id: params.customerId ?? undefined,
        state: params.state ?? undefined,
        limit: Math.min(200, Math.max(1, params.limit ?? 100)),
      })}`,
      { auth: { bearer: token } }
    );
    return { giftCards: (r.gift_cards ?? []).map(mapSellerGiftCard), cursor: r.cursor ?? null };
  });
}

export async function retrieveSquareGiftCard(companyId: string, giftCardId: string): Promise<SellerRead<SellerGiftCard>> {
  return withSellerToken(companyId, "RetrieveGiftCard", async (token) => {
    const r = await squareFetch<{ gift_card: SquareGiftCardRaw }>(`/v2/gift-cards/${encodeURIComponent(giftCardId)}`, { auth: { bearer: token } });
    return mapSellerGiftCard(r.gift_card);
  });
}

/** A card by the number the client holds. Square answers 404 for an unknown number → NOT_FOUND. */
export async function retrieveSquareGiftCardByGan(companyId: string, gan: string): Promise<SellerRead<SellerGiftCard | null>> {
  return withSellerToken(companyId, "RetrieveGiftCardFromGAN", async (token) => {
    try {
      const r = await squareFetch<{ gift_card: SquareGiftCardRaw }>(`/v2/gift-cards/from-gan`, { auth: { bearer: token }, method: "POST", body: { gan } });
      return mapSellerGiftCard(r.gift_card);
    } catch (err) {
      if (err instanceof SquareError && (err.status === 404 || err.code === "NOT_FOUND")) return null;
      throw err;
    }
  });
}

/** A new DIGITAL card: PENDING with a $0 balance until it is activated. */
export async function createSquareGiftCard(companyId: string, params: { locationId: string; idempotencyKey: string }): Promise<SellerRead<SellerGiftCard>> {
  return withSellerToken(companyId, "CreateGiftCard", async (token) => {
    const r = await squareFetch<{ gift_card: SquareGiftCardRaw }>(`/v2/gift-cards`, {
      auth: { bearer: token },
      method: "POST",
      body: { idempotency_key: productIdempotencyKey(params.idempotencyKey), location_id: params.locationId, gift_card: { type: "DIGITAL" } },
    });
    return mapSellerGiftCard(r.gift_card);
  });
}

export async function linkSquareGiftCardToCustomer(companyId: string, giftCardId: string, customerId: string): Promise<SellerRead<SellerGiftCard>> {
  return withSellerToken(companyId, "LinkCustomerToGiftCard", async (token) => {
    const r = await squareFetch<{ gift_card: SquareGiftCardRaw }>(`/v2/gift-cards/${encodeURIComponent(giftCardId)}/link-customer`, {
      auth: { bearer: token },
      method: "POST",
      body: { customer_id: customerId },
    });
    return mapSellerGiftCard(r.gift_card);
  });
}

export type GiftCardActivityType =
  | "ACTIVATE"
  | "LOAD"
  | "REDEEM"
  | "CLEAR_BALANCE"
  | "DEACTIVATE"
  | "ADJUST_INCREMENT"
  | "ADJUST_DECREMENT"
  | "REFUND"
  | "UNLINKED_ACTIVITY_REFUND"
  | "IMPORT"
  | "BLOCK"
  | "UNBLOCK"
  | "IMPORT_REVERSAL"
  | "TRANSFER_BALANCE_FROM"
  | "TRANSFER_BALANCE_TO"
  | string;

export type SellerGiftCardActivity = {
  id: string;
  type: GiftCardActivityType;
  createdAt: string | null;
  /** Signed: money onto the card is positive, off it negative. */
  deltaCents: number;
  balanceAfterCents: number;
  /** The Square payment that redeemed it (REDEEM), when known. */
  paymentId: string | null;
  reason: string | null;
};

type SquareGiftCardActivityRaw = {
  id: string;
  type?: string;
  created_at?: string;
  gift_card_balance_money?: SquareMoney;
  activate_activity_details?: { amount_money?: SquareMoney };
  load_activity_details?: { amount_money?: SquareMoney };
  redeem_activity_details?: { amount_money?: SquareMoney; payment_id?: string };
  refund_activity_details?: { amount_money?: SquareMoney; payment_id?: string; reason?: string };
  unlinked_activity_refund_activity_details?: { amount_money?: SquareMoney; payment_id?: string };
  adjust_increment_activity_details?: { amount_money?: SquareMoney; reason?: string };
  adjust_decrement_activity_details?: { amount_money?: SquareMoney; reason?: string };
  clear_balance_activity_details?: { reason?: string };
  deactivate_activity_details?: { reason?: string };
  import_activity_details?: { amount_money?: SquareMoney };
  transfer_balance_from_activity_details?: { amount_money?: SquareMoney };
  transfer_balance_to_activity_details?: { amount_money?: SquareMoney };
};

/** Which way the money moved for each activity type (pure). */
export function giftCardActivityDelta(a: SquareGiftCardActivityRaw): number {
  switch (a.type) {
    case "ACTIVATE":
      return cents(a.activate_activity_details?.amount_money);
    case "LOAD":
      return cents(a.load_activity_details?.amount_money);
    case "REDEEM":
      return -cents(a.redeem_activity_details?.amount_money);
    case "REFUND":
      return cents(a.refund_activity_details?.amount_money);
    case "UNLINKED_ACTIVITY_REFUND":
      return cents(a.unlinked_activity_refund_activity_details?.amount_money);
    case "ADJUST_INCREMENT":
      return cents(a.adjust_increment_activity_details?.amount_money);
    case "ADJUST_DECREMENT":
      return -cents(a.adjust_decrement_activity_details?.amount_money);
    case "IMPORT":
      return cents(a.import_activity_details?.amount_money);
    case "TRANSFER_BALANCE_TO":
      return cents(a.transfer_balance_to_activity_details?.amount_money);
    case "TRANSFER_BALANCE_FROM":
      return -cents(a.transfer_balance_from_activity_details?.amount_money);
    default:
      return 0;
  }
}

export function mapSellerGiftCardActivity(a: SquareGiftCardActivityRaw): SellerGiftCardActivity {
  return {
    id: a.id,
    type: a.type ?? "OTHER",
    createdAt: a.created_at ?? null,
    deltaCents: giftCardActivityDelta(a),
    balanceAfterCents: cents(a.gift_card_balance_money),
    paymentId: a.redeem_activity_details?.payment_id ?? a.refund_activity_details?.payment_id ?? a.unlinked_activity_refund_activity_details?.payment_id ?? null,
    reason:
      a.refund_activity_details?.reason ??
      a.adjust_increment_activity_details?.reason ??
      a.adjust_decrement_activity_details?.reason ??
      a.clear_balance_activity_details?.reason ??
      a.deactivate_activity_details?.reason ??
      null,
  };
}

export async function listSquareGiftCardActivities(
  companyId: string,
  giftCardId: string,
  params: { cursor?: string | null; limit?: number } = {}
): Promise<SellerRead<{ activities: SellerGiftCardActivity[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListGiftCardActivities", async (token) => {
    const r = await squareFetch<{ gift_card_activities?: SquareGiftCardActivityRaw[]; cursor?: string }>(
      `/v2/gift-cards/activities${qs({ gift_card_id: giftCardId, cursor: params.cursor ?? undefined, limit: Math.min(100, params.limit ?? 50), sort_order: "DESC" })}`,
      { auth: { bearer: token } }
    );
    return { activities: (r.gift_card_activities ?? []).map(mapSellerGiftCardActivity), cursor: r.cursor ?? null };
  });
}

/**
 * Put money on a card: ACTIVATE a PENDING card, LOAD an ACTIVE one. Without
 * the Orders API Square wants the payment instruments that paid for it —
 * the Square payment id when the money went through Square, else our own
 * payment id — and a reference (the invoice). Square charges the seller its
 * gift card fee on the amount (2.5% in the US).
 */
export async function loadSquareGiftCard(
  companyId: string,
  params: { giftCardId: string; locationId: string; amountCents: number; paymentInstrumentIds: string[]; referenceId: string; idempotencyKey: string; activate: boolean }
): Promise<SellerRead<SellerGiftCardActivity>> {
  return withSellerToken(companyId, params.activate ? "ActivateGiftCard" : "LoadGiftCard", async (token) => {
    const details = {
      amount_money: money(params.amountCents),
      buyer_payment_instrument_ids: params.paymentInstrumentIds.slice(0, 10),
      reference_id: params.referenceId.slice(0, 40),
    };
    const r = await squareFetch<{ gift_card_activity: SquareGiftCardActivityRaw }>(`/v2/gift-cards/activities`, {
      auth: { bearer: token },
      method: "POST",
      body: {
        idempotency_key: productIdempotencyKey(params.idempotencyKey),
        gift_card_activity: {
          type: params.activate ? "ACTIVATE" : "LOAD",
          location_id: params.locationId,
          gift_card_id: params.giftCardId,
          ...(params.activate ? { activate_activity_details: details } : { load_activity_details: details }),
        },
      },
      timeoutMs: 25_000,
    });
    return mapSellerGiftCardActivity(r.gift_card_activity);
  });
}

// ─── Loyalty (LOYALTY_READ / LOYALTY_WRITE) ─────────────────────────────────

export type LoyaltyRewardTier = {
  id: string;
  name: string;
  points: number;
  /** ORDER = off the whole sale (what WorkBench can apply to an invoice); ITEM_VARIATION / CATEGORY = one item only. */
  scope: "ORDER" | "ITEM_VARIATION" | "CATEGORY" | string;
  discountType: "FIXED_AMOUNT" | "FIXED_PERCENTAGE" | string;
  /** Cents, for FIXED_AMOUNT. */
  amountCents: number | null;
  /** Whole percent, for FIXED_PERCENTAGE. */
  percent: number | null;
  /** Cap on a percentage reward, cents. */
  maxCents: number | null;
};

export type LoyaltyAccrualRule = {
  type: "VISIT" | "SPEND" | "ITEM_VARIATION" | "CATEGORY" | string;
  points: number;
  /** SPEND: one `points` per this many cents. VISIT: the minimum sale. */
  perCents: number | null;
};

export type LoyaltyProgram = {
  id: string;
  status: "ACTIVE" | "INACTIVE" | string;
  /** "point" / "points" (or "star" / "stars" …) — the seller's word. */
  one: string;
  other: string;
  tiers: LoyaltyRewardTier[];
  accrual: LoyaltyAccrualRule[];
  locationIds: string[];
  expiration: string | null;
};

type LoyaltyProgramRaw = {
  id: string;
  status?: string;
  terminology?: { one?: string; other?: string };
  location_ids?: string[];
  expiration_policy?: { expiration_duration?: string };
  reward_tiers?: {
    id: string;
    name?: string;
    points?: number;
    definition?: { scope?: string; discount_type?: string; percentage_discount?: string; fixed_discount_money?: SquareMoney; max_discount_money?: SquareMoney };
  }[];
  accrual_rules?: {
    accrual_type?: string;
    points?: number;
    spend_data?: { amount_money?: SquareMoney };
    visit_data?: { minimum_amount_money?: SquareMoney };
  }[];
};

export function mapLoyaltyProgram(p: LoyaltyProgramRaw): LoyaltyProgram {
  return {
    id: p.id,
    status: p.status ?? "INACTIVE",
    one: p.terminology?.one?.trim() || "point",
    other: p.terminology?.other?.trim() || "points",
    tiers: (p.reward_tiers ?? []).map((t) => ({
      id: t.id,
      name: t.name?.trim() || "Reward",
      points: Number(t.points ?? 0),
      scope: t.definition?.scope ?? "ORDER",
      discountType: t.definition?.discount_type ?? "FIXED_AMOUNT",
      amountCents: t.definition?.fixed_discount_money ? cents(t.definition.fixed_discount_money) : null,
      percent: t.definition?.percentage_discount != null ? Number(t.definition.percentage_discount) : null,
      maxCents: t.definition?.max_discount_money ? cents(t.definition.max_discount_money) : null,
    })),
    accrual: (p.accrual_rules ?? []).map((r) => ({
      type: r.accrual_type ?? "SPEND",
      points: Number(r.points ?? 0),
      perCents: r.spend_data?.amount_money ? cents(r.spend_data.amount_money) : r.visit_data?.minimum_amount_money ? cents(r.visit_data.minimum_amount_money) : null,
    })),
    locationIds: p.location_ids ?? [],
    expiration: p.expiration_policy?.expiration_duration ?? null,
  };
}

/** "1 point per $1 spent" / "5 points per visit" — the accrual rule in words (pure). */
export function accrualRuleLabel(rule: LoyaltyAccrualRule, program: Pick<LoyaltyProgram, "one" | "other">): string {
  const word = rule.points === 1 ? program.one : program.other;
  const dollars = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
  if (rule.type === "SPEND") return `${rule.points} ${word} per ${rule.perCents ? dollars(rule.perCents) : "$1"} spent`;
  if (rule.type === "VISIT") return `${rule.points} ${word} per visit${rule.perCents ? ` of ${dollars(rule.perCents)} or more` : ""}`;
  if (rule.type === "CATEGORY") return `${rule.points} ${word} per item in a category`;
  if (rule.type === "ITEM_VARIATION") return `${rule.points} ${word} per specific item`;
  return `${rule.points} ${word}`;
}

/** "$5 off" / "10% off (up to $20)" — a tier's reward in words (pure). */
export function rewardTierLabel(tier: LoyaltyRewardTier): string {
  const dollars = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);
  const what = tier.discountType === "FIXED_PERCENTAGE" ? `${tier.percent ?? 0}% off` : `${dollars(tier.amountCents ?? 0)} off`;
  const cap = tier.discountType === "FIXED_PERCENTAGE" && tier.maxCents ? ` (up to ${dollars(tier.maxCents)})` : "";
  const scope = tier.scope === "ORDER" ? "" : tier.scope === "CATEGORY" ? " one category" : " one item";
  return `${what}${scope}${cap}`;
}

/**
 * The discount a reward tier puts on an invoice (pure): FIXED_AMOUNT → a
 * fixed dollar discount capped at the subtotal; FIXED_PERCENTAGE → a
 * percent, turned into a fixed amount when the tier's cap bites. Only
 * ORDER-scope tiers apply to a whole invoice; item tiers answer null.
 */
export function rewardDiscountFor(tier: LoyaltyRewardTier, subtotal: number): { discountType: "FIXED" | "PERCENT"; discountValue: number } | null {
  if (tier.scope !== "ORDER" || subtotal <= 0) return null;
  if (tier.discountType === "FIXED_AMOUNT") {
    const amount = Math.min(subtotal, Math.round((tier.amountCents ?? 0)) / 100);
    return amount > 0 ? { discountType: "FIXED", discountValue: Math.round(amount * 100) / 100 } : null;
  }
  if (tier.discountType === "FIXED_PERCENTAGE") {
    const pct = Math.min(100, Math.max(0, tier.percent ?? 0));
    if (pct <= 0) return null;
    const raw = Math.round(subtotal * pct) / 100;
    if (tier.maxCents != null && raw > tier.maxCents / 100) {
      return { discountType: "FIXED", discountValue: Math.round(tier.maxCents) / 100 };
    }
    return { discountType: "PERCENT", discountValue: pct };
  }
  return null;
}

/** The seller's main program, or null when there is none (Square answers 404). */
export async function retrieveLoyaltyProgram(companyId: string): Promise<SellerRead<LoyaltyProgram | null>> {
  return withSellerToken(companyId, "RetrieveLoyaltyProgram", async (token) => {
    try {
      const r = await squareFetch<{ program: LoyaltyProgramRaw }>(`/v2/loyalty/programs/main`, { auth: { bearer: token } });
      return mapLoyaltyProgram(r.program);
    } catch (err) {
      if (err instanceof SquareError && (err.status === 404 || err.code === "NOT_FOUND")) return null;
      throw err;
    }
  });
}

export type LoyaltyAccount = {
  id: string;
  programId: string;
  balance: number;
  lifetimePoints: number;
  customerId: string | null;
  phone: string | null;
  enrolledAt: string | null;
  createdAt: string | null;
};

type LoyaltyAccountRaw = {
  id: string;
  program_id?: string;
  balance?: number;
  lifetime_points?: number;
  customer_id?: string;
  enrolled_at?: string;
  created_at?: string;
  mapping?: { phone_number?: string };
};

export function mapLoyaltyAccount(a: LoyaltyAccountRaw): LoyaltyAccount {
  return {
    id: a.id,
    programId: a.program_id ?? "",
    balance: Number(a.balance ?? 0),
    lifetimePoints: Number(a.lifetime_points ?? 0),
    customerId: a.customer_id ?? null,
    phone: a.mapping?.phone_number ?? null,
    enrolledAt: a.enrolled_at ?? null,
    createdAt: a.created_at ?? null,
  };
}

export async function searchLoyaltyAccounts(
  companyId: string,
  params: { phone?: string | null; customerIds?: string[] | null; cursor?: string | null; limit?: number } = {}
): Promise<SellerRead<{ accounts: LoyaltyAccount[]; cursor: string | null }>> {
  return withSellerToken(companyId, "SearchLoyaltyAccounts", async (token) => {
    const query: Record<string, unknown> = {};
    if (params.phone) query.mappings = [{ phone_number: params.phone }];
    if (params.customerIds?.length) query.customer_ids = params.customerIds.slice(0, 30);
    const r = await squareFetch<{ loyalty_accounts?: LoyaltyAccountRaw[]; cursor?: string }>(`/v2/loyalty/accounts/search`, {
      auth: { bearer: token },
      method: "POST",
      body: { ...(Object.keys(query).length ? { query } : {}), limit: Math.min(200, Math.max(1, params.limit ?? 100)), ...(params.cursor ? { cursor: params.cursor } : {}) },
    });
    return { accounts: (r.loyalty_accounts ?? []).map(mapLoyaltyAccount), cursor: r.cursor ?? null };
  });
}

export async function retrieveLoyaltyAccount(companyId: string, accountId: string): Promise<SellerRead<LoyaltyAccount | null>> {
  return withSellerToken(companyId, "RetrieveLoyaltyAccount", async (token) => {
    try {
      const r = await squareFetch<{ loyalty_account: LoyaltyAccountRaw }>(`/v2/loyalty/accounts/${encodeURIComponent(accountId)}`, { auth: { bearer: token } });
      return mapLoyaltyAccount(r.loyalty_account);
    } catch (err) {
      if (err instanceof SquareError && (err.status === 404 || err.code === "NOT_FOUND")) return null;
      throw err;
    }
  });
}

export async function createLoyaltyAccount(
  companyId: string,
  params: { programId: string; phone: string; customerId?: string | null; idempotencyKey: string }
): Promise<SellerRead<LoyaltyAccount>> {
  return withSellerToken(companyId, "CreateLoyaltyAccount", async (token) => {
    const r = await squareFetch<{ loyalty_account: LoyaltyAccountRaw }>(`/v2/loyalty/accounts`, {
      auth: { bearer: token },
      method: "POST",
      body: {
        idempotency_key: productIdempotencyKey(params.idempotencyKey),
        loyalty_account: { program_id: params.programId, mapping: { phone_number: params.phone }, ...(params.customerId ? { customer_id: params.customerId } : {}) },
      },
    });
    return mapLoyaltyAccount(r.loyalty_account);
  });
}

/** How many points a sale of this size earns under the program's rules (Square does the math). */
export async function calculateLoyaltyPoints(
  companyId: string,
  params: { programId: string; amountCents: number; accountId?: string | null }
): Promise<SellerRead<{ points: number; promotionPoints: number }>> {
  return withSellerToken(companyId, "CalculateLoyaltyPoints", async (token) => {
    const r = await squareFetch<{ points?: number; promotion_points?: number }>(`/v2/loyalty/programs/${encodeURIComponent(params.programId)}/calculate`, {
      auth: { bearer: token },
      method: "POST",
      body: { transaction_amount_money: money(params.amountCents), ...(params.accountId ? { loyalty_account_id: params.accountId } : {}) },
    });
    return { points: Number(r.points ?? 0), promotionPoints: Number(r.promotion_points ?? 0) };
  });
}

export async function accumulateLoyaltyPoints(
  companyId: string,
  params: { accountId: string; points: number; locationId: string; idempotencyKey: string }
): Promise<SellerRead<{ balance: number | null }>> {
  return withSellerToken(companyId, "AccumulateLoyaltyPoints", async (token) => {
    const r = await squareFetch<{ events?: { accumulate_points?: { points?: number } }[]; event?: unknown }>(`/v2/loyalty/accounts/${encodeURIComponent(params.accountId)}/accumulate`, {
      auth: { bearer: token },
      method: "POST",
      body: { accumulate_points: { points: Math.round(params.points) }, location_id: params.locationId, idempotency_key: productIdempotencyKey(params.idempotencyKey) },
    });
    void r;
    return { balance: null };
  });
}

export async function adjustLoyaltyPoints(
  companyId: string,
  params: { accountId: string; points: number; reason: string; idempotencyKey: string }
): Promise<SellerRead<void>> {
  return withSellerToken(companyId, "AdjustLoyaltyPoints", async (token) => {
    await squareFetch(`/v2/loyalty/accounts/${encodeURIComponent(params.accountId)}/adjust`, {
      auth: { bearer: token },
      method: "POST",
      body: { idempotency_key: productIdempotencyKey(params.idempotencyKey), adjust_points: { points: Math.round(params.points), reason: params.reason.slice(0, 200) }, allow_negative_balance: false },
    });
  });
}

export type LoyaltyReward = { id: string; status: "ISSUED" | "REDEEMED" | "DELETED" | string; points: number; tierId: string; accountId: string };

type LoyaltyRewardRaw = { id: string; status?: string; points?: number; reward_tier_id?: string; loyalty_account_id?: string };

export function mapLoyaltyReward(r: LoyaltyRewardRaw): LoyaltyReward {
  return { id: r.id, status: r.status ?? "ISSUED", points: Number(r.points ?? 0), tierId: r.reward_tier_id ?? "", accountId: r.loyalty_account_id ?? "" };
}

/** Issue a reward (points are set aside) with no Square order behind it — WorkBench applies the discount to its own invoice. */
export async function createLoyaltyReward(
  companyId: string,
  params: { accountId: string; tierId: string; idempotencyKey: string }
): Promise<SellerRead<LoyaltyReward>> {
  return withSellerToken(companyId, "CreateLoyaltyReward", async (token) => {
    const r = await squareFetch<{ reward: LoyaltyRewardRaw }>(`/v2/loyalty/rewards`, {
      auth: { bearer: token },
      method: "POST",
      body: { idempotency_key: productIdempotencyKey(params.idempotencyKey), reward: { loyalty_account_id: params.accountId, reward_tier_id: params.tierId } },
    });
    return mapLoyaltyReward(r.reward);
  });
}

export async function redeemLoyaltyReward(companyId: string, params: { rewardId: string; locationId: string; idempotencyKey: string }): Promise<SellerRead<void>> {
  return withSellerToken(companyId, "RedeemLoyaltyReward", async (token) => {
    await squareFetch(`/v2/loyalty/rewards/${encodeURIComponent(params.rewardId)}/redeem`, {
      auth: { bearer: token },
      method: "POST",
      body: { idempotency_key: productIdempotencyKey(params.idempotencyKey), location_id: params.locationId },
    });
  });
}

/** Un-issue a reward (points go back) — when the invoice could not take the discount. */
export async function deleteLoyaltyReward(companyId: string, rewardId: string): Promise<SellerRead<void>> {
  return withSellerToken(companyId, "DeleteLoyaltyReward", async (token) => {
    await squareFetch(`/v2/loyalty/rewards/${encodeURIComponent(rewardId)}`, { auth: { bearer: token }, method: "DELETE" });
  });
}
