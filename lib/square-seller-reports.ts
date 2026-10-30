import { reportError } from "@/lib/report-error";
import {
  isTransientSquareError,
  squareApplicationId,
  squareFetch,
  squareHost,
  SquareError,
  SQUARE_API_VERSION,
  type SquareApiError,
  type SquareMoney,
  type SquarePayment,
} from "@/lib/square";
import { SquareNotConnectedError, squareTokenForCompany } from "@/lib/square-connection";

/**
 * Seller-token READS behind the Square tabs on /app/payments (2026-10-28,
 * plan docs/plans/plan-gating-square-billing-2026-10-28.md § 3): every sale
 * the seller's Square account took (POS, Square Online, Invoices — not only
 * WorkBench charges), the payouts to their bank with per-payout entries, and
 * disputes with evidence upload / accept. Nothing here is cached in the
 * database — every call reads live from Square with the seller's OAuth token
 * (`squareTokenForCompany`, refreshed when due, never stored in a request).
 *
 * Every reader is best-effort and answers a `SellerRead`: the page renders
 * from our own records when Square is briefly down (`transient`), and says
 * "Reconnect Square" when the grant predates PAYOUTS_READ / DISPUTES_READ
 * (`missingScopes` — Square answers 403 INSUFFICIENT_SCOPES).
 */

// ─── Result shape ───────────────────────────────────────────────────────────

export type SellerReadFailure = {
  ok: false;
  /** Square was unreachable / rate-limited / 5xx — try again later. */
  transient: boolean;
  /** The stored grant lacks the scope this read needs — reconnect Square. */
  missingScopes: boolean;
  /** No Square connection for this company. */
  notConnected: boolean;
  /** Square's own refusal (a 4xx that is neither of the above). */
  message: string;
};
export type SellerRead<T> = { ok: true; data: T } | SellerReadFailure;

export function isMissingScopesError(err: unknown): boolean {
  return (
    err instanceof SquareError &&
    (err.status === 403 || err.code === "INSUFFICIENT_SCOPES" || err.code === "FORBIDDEN")
  );
}

/** Classify a thrown error into the SellerRead failure shape (pure). */
export function sellerFailure(err: unknown): SellerReadFailure {
  if (err instanceof SquareNotConnectedError) {
    return { ok: false, transient: false, missingScopes: false, notConnected: true, message: err.message };
  }
  if (isMissingScopesError(err)) {
    return {
      ok: false,
      transient: false,
      missingScopes: true,
      notConnected: false,
      message: "Reconnect Square to let WorkBench read this.",
    };
  }
  if (isTransientSquareError(err)) {
    return {
      ok: false,
      transient: true,
      missingScopes: false,
      notConnected: false,
      message: "Square didn't answer — try again in a moment.",
    };
  }
  return {
    ok: false,
    transient: false,
    missingScopes: false,
    notConnected: false,
    message: err instanceof SquareError ? err.message : "Square couldn't complete that.",
  };
}

/**
 * HTTP status + body for an API route answering a failed SellerRead. Square
 * being down is 424 (never 502/504 — Cloudflare swallows those bodies); a
 * missing scope is 409 with `code: "MISSING_SCOPES"` so the client can offer
 * Reconnect; no connection is 400.
 */
export function sellerFailureStatus(f: SellerReadFailure): { status: number; body: { error: string; code?: string } } {
  if (f.notConnected) return { status: 400, body: { error: f.message, code: "NOT_CONNECTED" } };
  if (f.missingScopes) return { status: 409, body: { error: f.message, code: "MISSING_SCOPES" } };
  if (f.transient) return { status: 424, body: { error: f.message, code: "SQUARE_DOWN" } };
  return { status: 424, body: { error: f.message } };
}

export async function withSellerToken<T>(companyId: string, label: string, fn: (token: string) => Promise<T>): Promise<SellerRead<T>> {
  try {
    const { token } = await squareTokenForCompany(companyId);
    return { ok: true, data: await fn(token) };
  } catch (err) {
    const f = sellerFailure(err);
    if (!f.transient && !f.missingScopes && !f.notConnected) reportError(`[square] ${label} failed`, err, { companyId });
    else if (f.transient) console.warn(`[square] ${label}: transient failure for company ${companyId}:`, err instanceof Error ? err.message : err);
    return f;
  }
}

const cents = (m: SquareMoney | undefined | null): number => (m?.amount != null ? Number(m.amount) : 0);
export function sumMoney(list: { amount_money?: SquareMoney }[] | undefined | null): number {
  return (list ?? []).reduce((s, x) => s + cents(x.amount_money), 0);
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── Payments (ListPayments, PAYMENTS_READ) ─────────────────────────────────

/** Square's own products a payment can come from (`application_details.square_product`). */
export type SquareProduct =
  | "APPOINTMENTS"
  | "ECOMMERCE_API"
  | "INVOICES"
  | "ONLINE_STORE"
  | "OTHER"
  | "RESTAURANTS"
  | "RETAIL"
  | "SQUARE_POS"
  | "TERMINAL_API"
  | "VIRTUAL_TERMINAL"
  | string;

export type SellerPayment = {
  id: string;
  createdAt: string;
  /** What the buyer was charged, before the tip. */
  amountCents: number;
  tipCents: number;
  /** amount + tip (Square's total_money). */
  totalCents: number;
  /** Processing fee Square took (sum of processing_fee[]; 0 until Square posts it, usually within a day). */
  feeCents: number;
  status: SquarePayment["status"];
  cardBrand: string | null;
  last4: string | null;
  sourceType: string | null;
  /** Which Square product took it (null for third-party apps such as WorkBench). */
  squareProduct: SquareProduct | null;
  applicationId: string | null;
  referenceId: string | null;
  orderId: string | null;
  receiptUrl: string | null;
  refundedCents: number;
  note: string | null;
  customerId: string | null;
  locationId: string | null;
};

type SquarePaymentFull = SquarePayment & {
  tip_money?: SquareMoney;
  total_money?: SquareMoney;
  receipt_url?: string;
  order_id?: string;
  application_details?: { square_product?: string; application_id?: string };
};

export function mapSellerPayment(p: SquarePaymentFull): SellerPayment {
  const fee = sumMoney(p.processing_fee);
  return {
    id: p.id,
    createdAt: p.created_at ?? new Date(0).toISOString(),
    amountCents: cents(p.amount_money),
    tipCents: cents(p.tip_money),
    totalCents: p.total_money ? cents(p.total_money) : cents(p.amount_money) + cents(p.tip_money),
    feeCents: fee,
    status: p.status,
    cardBrand: p.card_details?.card?.card_brand ?? null,
    last4: p.card_details?.card?.last_4 ?? p.bank_account_details?.ach_details?.account_number_suffix ?? null,
    sourceType: p.source_type ?? null,
    squareProduct: p.application_details?.square_product ?? null,
    applicationId: p.application_details?.application_id ?? null,
    referenceId: p.reference_id ?? null,
    orderId: p.order_id ?? null,
    receiptUrl: p.receipt_url ?? null,
    refundedCents: cents(p.refunded_money),
    note: p.note ?? null,
    customerId: p.customer_id ?? null,
    locationId: p.location_id ?? null,
  };
}

/**
 * Did WorkBench take this payment? Our application id on the payment, or
 * (older rows / Tap to Pay recorded by id) a Payment row carrying its id as
 * `processorRef` — the caller passes the set it looked up. Everything else
 * is a sale the seller took in another Square product ("outside WorkBench").
 */
export function isWorkBenchPayment(
  p: Pick<SellerPayment, "id" | "applicationId">,
  recordedIds: ReadonlySet<string>,
  ourApplicationId: string = squareApplicationId()
): boolean {
  if (recordedIds.has(p.id)) return true;
  return Boolean(ourApplicationId) && p.applicationId === ourApplicationId;
}

export async function listSquarePayments(
  companyId: string,
  params: { beginTime?: Date | string; endTime?: Date | string; locationId?: string | null; cursor?: string | null; limit?: number } = {}
): Promise<SellerRead<{ payments: SellerPayment[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListPayments", async (token) => {
    const r = await squareFetch<{ payments?: SquarePaymentFull[]; cursor?: string }>(
      `/v2/payments${qs({
        begin_time: params.beginTime ? new Date(params.beginTime).toISOString() : undefined,
        end_time: params.endTime ? new Date(params.endTime).toISOString() : undefined,
        location_id: params.locationId ?? undefined,
        cursor: params.cursor ?? undefined,
        limit: Math.min(100, Math.max(1, params.limit ?? 100)),
        sort_order: "DESC",
      })}`,
      { auth: { bearer: token } }
    );
    return { payments: (r.payments ?? []).map(mapSellerPayment), cursor: r.cursor ?? null };
  });
}

// ─── Payouts (ListPayouts / ListPayoutEntries, PAYOUTS_READ) ────────────────

export type SquarePayoutStatusWord = "SENT" | "FAILED" | "PAID" | string;

export type SellerPayout = {
  id: string;
  status: SquarePayoutStatusWord;
  createdAt: string;
  updatedAt: string | null;
  /** The day the money lands (Square's estimate), YYYY-MM-DD. */
  arrivalDate: string | null;
  /** Net amount sent to the destination. */
  amountCents: number;
  /** Fees Square charged for the payout itself (instant-transfer fee etc.). */
  feeCents: number;
  destinationType: "BANK_ACCOUNT" | "CARD" | "SQUARE_BALANCE" | "SQUARE_STORED_BALANCE" | string | null;
  destinationId: string | null;
  /** Last 4 of the bank account, when ListBankAccounts can name it. */
  destinationLast4: string | null;
  /** BATCH (the daily schedule) or SIMPLE (an instant / manual transfer). */
  type: "BATCH" | "SIMPLE" | string | null;
  locationId: string | null;
  version: number | null;
};

type SquarePayoutRaw = {
  id: string;
  status?: string;
  location_id?: string;
  created_at?: string;
  updated_at?: string;
  amount_money?: SquareMoney;
  destination?: { type?: string; id?: string };
  version?: number;
  type?: string;
  payout_fee?: { amount_money?: SquareMoney; effective_at?: string; type?: string }[];
  arrival_date?: string;
  end_to_end_id?: string;
};

export function mapSellerPayout(p: SquarePayoutRaw, last4ById: ReadonlyMap<string, string> = new Map()): SellerPayout {
  const destId = p.destination?.id ?? null;
  return {
    id: p.id,
    status: p.status ?? "SENT",
    createdAt: p.created_at ?? new Date(0).toISOString(),
    updatedAt: p.updated_at ?? null,
    arrivalDate: p.arrival_date ?? null,
    amountCents: cents(p.amount_money),
    feeCents: sumMoney(p.payout_fee),
    destinationType: p.destination?.type ?? null,
    destinationId: destId,
    destinationLast4: destId ? last4ById.get(destId) ?? null : null,
    type: p.type ?? null,
    locationId: p.location_id ?? null,
    version: p.version ?? null,
  };
}

type BankAccountRaw = { id: string; account_number_suffix?: string; bank_name?: string; status?: string };

/** Bank account id → last 4, best effort (BANK_ACCOUNTS_READ; a 403 just leaves the column blank). */
async function bankLast4Map(token: string): Promise<Map<string, string>> {
  try {
    const r = await squareFetch<{ bank_accounts?: BankAccountRaw[] }>("/v2/bank-accounts?limit=100", { auth: { bearer: token } });
    return new Map((r.bank_accounts ?? []).filter((b) => b.account_number_suffix).map((b) => [b.id, b.account_number_suffix as string]));
  } catch {
    return new Map();
  }
}

export async function listSquarePayouts(
  companyId: string,
  params: { status?: SquarePayoutStatusWord; beginTime?: Date | string; endTime?: Date | string; locationId?: string | null; cursor?: string | null; limit?: number } = {}
): Promise<SellerRead<{ payouts: SellerPayout[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListPayouts", async (token) => {
    const [r, last4] = await Promise.all([
      squareFetch<{ payouts?: SquarePayoutRaw[]; cursor?: string }>(
        `/v2/payouts${qs({
          status: params.status,
          begin_time: params.beginTime ? new Date(params.beginTime).toISOString() : undefined,
          end_time: params.endTime ? new Date(params.endTime).toISOString() : undefined,
          location_id: params.locationId ?? undefined,
          cursor: params.cursor ?? undefined,
          limit: Math.min(100, Math.max(1, params.limit ?? 100)),
          sort_order: "DESC",
        })}`,
        { auth: { bearer: token } }
      ),
      bankLast4Map(token),
    ]);
    return { payouts: (r.payouts ?? []).map((p) => mapSellerPayout(p, last4)), cursor: r.cursor ?? null };
  });
}

export type SellerPayoutEntry = {
  id: string;
  payoutId: string;
  effectiveAt: string | null;
  /** CHARGE, REFUND, DISPUTE, FEE, ADJUSTMENT, … (Square's PayoutEntryType). */
  type: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  paymentId: string | null;
  refundId: string | null;
  disputeId: string | null;
};

type PayoutEntryRaw = {
  id: string;
  payout_id?: string;
  effective_at?: string;
  type?: string;
  gross_amount_money?: SquareMoney;
  fee_amount_money?: SquareMoney;
  net_amount_money?: SquareMoney;
  type_charge_details?: { payment_id?: string };
  type_refund_details?: { payment_id?: string; refund_id?: string };
  type_dispute_details?: { payment_id?: string; dispute_id?: string };
  type_open_dispute_details?: { payment_id?: string; dispute_id?: string };
  type_fee_details?: { payment_id?: string };
};

export function mapPayoutEntry(e: PayoutEntryRaw, payoutId: string): SellerPayoutEntry {
  const dispute = e.type_dispute_details ?? e.type_open_dispute_details;
  return {
    id: e.id,
    payoutId: e.payout_id ?? payoutId,
    effectiveAt: e.effective_at ?? null,
    type: e.type ?? "OTHER",
    grossCents: cents(e.gross_amount_money),
    feeCents: cents(e.fee_amount_money),
    netCents: cents(e.net_amount_money),
    paymentId: e.type_charge_details?.payment_id ?? e.type_refund_details?.payment_id ?? dispute?.payment_id ?? e.type_fee_details?.payment_id ?? null,
    refundId: e.type_refund_details?.refund_id ?? null,
    disputeId: dispute?.dispute_id ?? null,
  };
}

export async function listSquarePayoutEntries(
  companyId: string,
  payoutId: string,
  params: { cursor?: string | null; limit?: number } = {}
): Promise<SellerRead<{ entries: SellerPayoutEntry[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListPayoutEntries", async (token) => {
    const r = await squareFetch<{ payout_entries?: PayoutEntryRaw[]; cursor?: string }>(
      `/v2/payouts/${encodeURIComponent(payoutId)}/payout-entries${qs({
        cursor: params.cursor ?? undefined,
        limit: Math.min(100, Math.max(1, params.limit ?? 100)),
        sort_order: "DESC",
      })}`,
      { auth: { bearer: token } }
    );
    return { entries: (r.payout_entries ?? []).map((e) => mapPayoutEntry(e, payoutId)), cursor: r.cursor ?? null };
  });
}

// ─── Disputes (DISPUTES_READ / DISPUTES_WRITE) ──────────────────────────────

export type SquareDisputeState =
  | "INQUIRY_EVIDENCE_REQUIRED"
  | "INQUIRY_PROCESSING"
  | "INQUIRY_CLOSED"
  | "EVIDENCE_REQUIRED"
  | "PROCESSING"
  | "WON"
  | "LOST"
  | "ACCEPTED"
  | string;

export type SquareDisputeReason =
  | "AMOUNT_DIFFERS"
  | "CANCELLED"
  | "DUPLICATE"
  | "NO_KNOWLEDGE"
  | "NOT_AS_DESCRIBED"
  | "NOT_RECEIVED"
  | "PAID_BY_OTHER_MEANS"
  | "CUSTOMER_REQUESTS_CREDIT"
  | "EMV_LIABILITY_SHIFT"
  | string;

/** States the seller can still act on (upload evidence, submit, accept). */
export const OPEN_DISPUTE_STATES: ReadonlySet<string> = new Set(["INQUIRY_EVIDENCE_REQUIRED", "EVIDENCE_REQUIRED"]);
/** States that still count as "open" on the KPI (not yet decided). */
export const UNRESOLVED_DISPUTE_STATES: ReadonlySet<string> = new Set([
  "INQUIRY_EVIDENCE_REQUIRED",
  "INQUIRY_PROCESSING",
  "EVIDENCE_REQUIRED",
  "PROCESSING",
]);

export type SellerDispute = {
  id: string;
  state: SquareDisputeState;
  reason: SquareDisputeReason;
  amountCents: number;
  currency: string;
  /** Respond by (accept or submit evidence) — Square challenges automatically at this time. */
  dueAt: string | null;
  paymentId: string | null;
  cardBrand: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reportedDate: string | null;
  brandDisputeId: string | null;
  locationId: string | null;
  version: number | null;
};

type DisputeRaw = {
  id?: string;
  dispute_id?: string;
  amount_money?: SquareMoney;
  reason?: string;
  state?: string;
  due_at?: string;
  disputed_payment?: { payment_id?: string };
  card_brand?: string;
  created_at?: string;
  updated_at?: string;
  brand_dispute_id?: string;
  reported_date?: string;
  reported_at?: string;
  version?: number;
  location_id?: string;
};

export function mapSellerDispute(d: DisputeRaw): SellerDispute {
  return {
    id: d.id ?? d.dispute_id ?? "",
    state: d.state ?? "EVIDENCE_REQUIRED",
    reason: d.reason ?? "NO_KNOWLEDGE",
    amountCents: cents(d.amount_money),
    currency: d.amount_money?.currency ?? "USD",
    dueAt: d.due_at ?? null,
    paymentId: d.disputed_payment?.payment_id ?? null,
    cardBrand: d.card_brand ?? null,
    createdAt: d.created_at ?? null,
    updatedAt: d.updated_at ?? null,
    reportedDate: d.reported_date ?? d.reported_at ?? null,
    brandDisputeId: d.brand_dispute_id ?? null,
    locationId: d.location_id ?? null,
    version: d.version ?? null,
  };
}

export async function listSquareDisputes(
  companyId: string,
  params: { states?: string[]; locationId?: string | null; cursor?: string | null } = {}
): Promise<SellerRead<{ disputes: SellerDispute[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListDisputes", async (token) => {
    const r = await squareFetch<{ disputes?: DisputeRaw[]; cursor?: string }>(
      `/v2/disputes${qs({
        states: params.states?.length ? params.states.join(",") : undefined,
        location_id: params.locationId ?? undefined,
        cursor: params.cursor ?? undefined,
      })}`,
      { auth: { bearer: token } }
    );
    return { disputes: (r.disputes ?? []).map(mapSellerDispute), cursor: r.cursor ?? null };
  });
}

export async function retrieveSquareDispute(companyId: string, disputeId: string): Promise<SellerRead<SellerDispute>> {
  return withSellerToken(companyId, "RetrieveDispute", async (token) => {
    const r = await squareFetch<{ dispute?: DisputeRaw }>(`/v2/disputes/${encodeURIComponent(disputeId)}`, { auth: { bearer: token } });
    return mapSellerDispute(r.dispute ?? {});
  });
}

/** Accept = the seller concedes; Square returns the money to the cardholder. Cannot be undone. */
export async function acceptSquareDispute(companyId: string, disputeId: string): Promise<SellerRead<SellerDispute>> {
  return withSellerToken(companyId, "AcceptDispute", async (token) => {
    const r = await squareFetch<{ dispute?: DisputeRaw }>(`/v2/disputes/${encodeURIComponent(disputeId)}/accept`, {
      method: "POST",
      body: {},
      auth: { bearer: token },
    });
    return mapSellerDispute(r.dispute ?? {});
  });
}

/** Challenge: tells the bank the uploaded evidence is complete. After this nothing can be added or removed. */
export async function submitSquareDisputeEvidence(companyId: string, disputeId: string): Promise<SellerRead<SellerDispute>> {
  return withSellerToken(companyId, "SubmitEvidence", async (token) => {
    const r = await squareFetch<{ dispute?: DisputeRaw }>(`/v2/disputes/${encodeURIComponent(disputeId)}/submit-evidence`, {
      method: "POST",
      body: {},
      auth: { bearer: token },
    });
    return mapSellerDispute(r.dispute ?? {});
  });
}

/** Square's DisputeEvidenceType — what a piece of evidence is. */
export const SQUARE_EVIDENCE_TYPES = [
  "GENERIC_EVIDENCE",
  "ONLINE_OR_APP_ACCESS_LOG",
  "AUTHORIZATION_DOCUMENTATION",
  "CANCELLATION_OR_REFUND_DOCUMENTATION",
  "CARDHOLDER_COMMUNICATION",
  "CARDHOLDER_INFORMATION",
  "PURCHASE_ACKNOWLEDGEMENT",
  "DUPLICATE_CHARGE_DOCUMENTATION",
  "PRODUCT_OR_SERVICE_DESCRIPTION",
  "RECEIPT",
  "SERVICE_RECEIVED_DOCUMENTATION",
  "PROOF_OF_DELIVERY_DOCUMENTATION",
  "RELATED_TRANSACTION_DOCUMENTATION",
  "REBUTTAL_EXPLANATION",
  "TRACKING_NUMBER",
] as const;
export type SquareEvidenceType = (typeof SQUARE_EVIDENCE_TYPES)[number];

export function isSquareEvidenceType(v: unknown): v is SquareEvidenceType {
  return typeof v === "string" && (SQUARE_EVIDENCE_TYPES as readonly string[]).includes(v);
}

/** Evidence files: up to 5 MB (developer.squareup.com/docs/disputes-api/process-disputes, read 2026-10-28). */
export const SQUARE_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
/** Square accepts PDF / JPEG / PNG / HEIF / TIFF; WorkBench offers the three every bank reads. */
export const SQUARE_EVIDENCE_CONTENT_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type SellerDisputeEvidence = {
  id: string;
  disputeId: string;
  evidenceType: string | null;
  fileName: string | null;
  fileType: string | null;
  text: string | null;
  uploadedAt: string | null;
};

type EvidenceRaw = {
  id?: string;
  evidence_id?: string;
  dispute_id?: string;
  evidence_type?: string;
  evidence_file?: { filename?: string; filetype?: string };
  evidence_text?: string;
  uploaded_at?: string;
};

export function mapDisputeEvidence(e: EvidenceRaw, disputeId: string): SellerDisputeEvidence {
  return {
    id: e.id ?? e.evidence_id ?? "",
    disputeId: e.dispute_id ?? disputeId,
    evidenceType: e.evidence_type ?? null,
    fileName: e.evidence_file?.filename ?? null,
    fileType: e.evidence_file?.filetype ?? null,
    text: e.evidence_text ?? null,
    uploadedAt: e.uploaded_at ?? null,
  };
}

export async function listSquareDisputeEvidence(
  companyId: string,
  disputeId: string,
  params: { cursor?: string | null } = {}
): Promise<SellerRead<{ evidence: SellerDisputeEvidence[]; cursor: string | null }>> {
  return withSellerToken(companyId, "ListDisputeEvidence", async (token) => {
    const r = await squareFetch<{ evidence?: EvidenceRaw[]; cursor?: string }>(
      `/v2/disputes/${encodeURIComponent(disputeId)}/evidence${qs({ cursor: params.cursor ?? undefined })}`,
      { auth: { bearer: token } }
    );
    return { evidence: (r.evidence ?? []).map((e) => mapDisputeEvidence(e, disputeId)), cursor: r.cursor ?? null };
  });
}

export async function createSquareDisputeEvidenceText(
  companyId: string,
  disputeId: string,
  params: { text: string; evidenceType?: SquareEvidenceType; idempotencyKey: string }
): Promise<SellerRead<SellerDisputeEvidence>> {
  return withSellerToken(companyId, "CreateDisputeEvidenceText", async (token) => {
    const r = await squareFetch<{ evidence?: EvidenceRaw }>(`/v2/disputes/${encodeURIComponent(disputeId)}/evidence-text`, {
      method: "POST",
      body: {
        idempotency_key: params.idempotencyKey.slice(0, 45),
        evidence_type: params.evidenceType ?? "REBUTTAL_EXPLANATION",
        evidence_text: params.text.slice(0, 500),
      },
      auth: { bearer: token },
    });
    return mapDisputeEvidence(r.evidence ?? {}, disputeId);
  });
}

/**
 * Upload one evidence file — multipart with a `request` JSON part and the
 * `file` part (squareFetch speaks JSON only, so this one goes to fetch
 * directly with the same headers, timeout and error shape).
 */
export async function createSquareDisputeEvidenceFile(
  companyId: string,
  disputeId: string,
  params: { fileName: string; contentType: string; bytes: Uint8Array; evidenceType?: SquareEvidenceType; idempotencyKey: string }
): Promise<SellerRead<SellerDisputeEvidence>> {
  return withSellerToken(companyId, "CreateDisputeEvidenceFile", async (token) => {
    if (!SQUARE_EVIDENCE_CONTENT_TYPES.has(params.contentType)) {
      throw new SquareError(400, [{ code: "INVALID_CONTENT_TYPE", detail: "Use a PDF, JPG, or PNG." }], "Unsupported evidence file type");
    }
    if (params.bytes.byteLength > SQUARE_EVIDENCE_MAX_BYTES) {
      throw new SquareError(400, [{ code: "FILE_TOO_LARGE", detail: "Evidence files can be up to 5 MB." }], "Evidence file too large");
    }
    const form = new FormData();
    form.append(
      "request",
      new Blob(
        [
          JSON.stringify({
            idempotency_key: params.idempotencyKey.slice(0, 45),
            evidence_type: params.evidenceType ?? "GENERIC_EVIDENCE",
            content_type: params.contentType,
          }),
        ],
        { type: "application/json" }
      )
    );
    form.append("file", new Blob([params.bytes as BlobPart], { type: params.contentType }), params.fileName.slice(0, 120) || "evidence");
    const res = await fetch(`${squareHost()}/v2/disputes/${encodeURIComponent(disputeId)}/evidence-files`, {
      method: "POST",
      headers: { "Square-Version": SQUARE_API_VERSION, Accept: "application/json", Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const text = await res.text();
    let json: { errors?: SquareApiError[]; evidence?: EvidenceRaw } | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) throw new SquareError(res.status, json?.errors ?? [], `Square request failed (${res.status})`);
    return mapDisputeEvidence(json?.evidence ?? {}, disputeId);
  });
}
