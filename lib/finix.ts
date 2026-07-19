/**
 * Finix API client (Streamflaire Payments).
 *
 * Thin typed wrapper over the Finix REST API — merchant onboarding (hosted
 * forms), buyer identities, payment-instrument token exchange, transfers, and
 * reversals. All amounts cross this boundary in CENTS (Finix's unit); the rest
 * of the app works in dollars, so convert at the call site with toCents().
 *
 * Environment selection: FINIX_ENVIRONMENT=sandbox|live picks the API host and
 * the default merchant processor (DUMMY_V1 in sandbox, FINIX_V1 live). Sandbox
 * API keys only work against the sandbox host and vice versa.
 */

const HOSTS = {
  sandbox: "https://finix.sandbox-payments-api.com",
  live: "https://finix.live-payments-api.com",
} as const;

export function finixEnvironment(): "sandbox" | "live" {
  return process.env.FINIX_ENVIRONMENT === "live" ? "live" : "sandbox";
}

export function finixApplicationId(): string {
  return process.env.FINIX_APPLICATION_ID ?? "";
}

/** True when API credentials + application are configured. */
export function finixConfigured(): boolean {
  return Boolean(
    process.env.FINIX_API_USERNAME &&
      process.env.FINIX_API_PASSWORD &&
      process.env.FINIX_APPLICATION_ID
  );
}

function processorName(): string {
  return (
    process.env.FINIX_PROCESSOR ??
    (finixEnvironment() === "live" ? "FINIX_V1" : "DUMMY_V1")
  );
}

/** Application-level per-transaction ceiling, in cents (sandbox app caps at $10k). */
function maxTransactionCents(): number {
  return Number(process.env.FINIX_MAX_TXN_CENTS ?? 1000000);
}

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export class FinixError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string
  ) {
    super(message);
    this.name = "FinixError";
  }
}

function basicAuth(): string {
  return Buffer.from(
    `${process.env.FINIX_API_USERNAME}:${process.env.FINIX_API_PASSWORD}`
  ).toString("base64");
}

async function parseFinixResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Finix error envelope: { _embedded: { errors: [{ message, code, field }] } }
    const first = data?._embedded?.errors?.[0];
    throw new FinixError(
      first?.message ?? `Finix request failed (${res.status})`,
      res.status,
      first?.field
    );
  }
  return data as T;
}

async function finixFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "PUT"; body?: unknown }
): Promise<T> {
  const res = await fetch(`${HOSTS[finixEnvironment()]}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return parseFinixResponse<T>(res);
}

// ─── Merchant onboarding (hosted forms) ──────────────────────────────────────

export interface OnboardingFormResult {
  id: string;
  status: string; // IN_PROGRESS | COMPLETED
  identity_id: string | null;
  onboarding_link?: { link_url: string; expires_at: string };
}

/**
 * Create a hosted onboarding form for a company. The returned link expires in
 * ~1 hour — never store it; mint a fresh one with createOnboardingFormLink().
 */
export async function createOnboardingForm(params: {
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
  returnUrl: string;
  expiredSessionUrl: string;
  tags?: Record<string, string>;
}): Promise<OnboardingFormResult> {
  const site = "https://workbenchfsm.com";
  return finixFetch<OnboardingFormResult>("/onboarding_forms", {
    method: "POST",
    body: {
      merchant_processors: [{ processor: processorName() }],
      onboarding_data: {
        entity: {
          ...(params.businessName ? { business_name: params.businessName } : {}),
          ...(params.email ? { email: params.email } : {}),
          ...(params.phone ? { business_phone: params.phone } : {}),
        },
        max_transaction_amount: maxTransactionCents(),
        ach_max_transaction_amount: maxTransactionCents(),
      },
      onboarding_link_details: {
        return_url: params.returnUrl,
        expired_session_url: params.expiredSessionUrl,
        terms_of_service_url: `${site}/terms`,
        fee_details_url: `${site}/pricing`,
      },
      tags: params.tags ?? {},
    },
  });
}

export async function getOnboardingForm(id: string): Promise<OnboardingFormResult> {
  return finixFetch<OnboardingFormResult>(`/onboarding_forms/${id}`);
}

/** Mint a fresh session link for an existing onboarding form (links expire hourly). */
export async function createOnboardingFormLink(
  id: string,
  params: { returnUrl: string; expiredSessionUrl: string }
): Promise<{ link_url: string; expires_at: string }> {
  const site = "https://workbenchfsm.com";
  const res = await finixFetch<{
    link_url?: string;
    onboarding_link?: { link_url: string; expires_at: string };
    expires_at?: string;
  }>(`/onboarding_forms/${id}/links`, {
    method: "POST",
    body: {
      return_url: params.returnUrl,
      expired_session_url: params.expiredSessionUrl,
      terms_of_service_url: `${site}/terms`,
      fee_details_url: `${site}/pricing`,
    },
  });
  // Finix returns the link either top-level or nested depending on endpoint version
  if (res.onboarding_link) return res.onboarding_link;
  return { link_url: res.link_url ?? "", expires_at: res.expires_at ?? "" };
}

// ─── Merchants ───────────────────────────────────────────────────────────────

export interface FinixMerchant {
  id: string;
  identity: string;
  onboarding_state: "PROVISIONING" | "APPROVED" | "REJECTED" | "UPDATE_REQUESTED";
  processing_enabled: boolean;
}

export async function getMerchant(id: string): Promise<FinixMerchant> {
  return finixFetch<FinixMerchant>(`/merchants/${id}`);
}

/** Merchants provisioned under a seller identity (onboarding forms create one). */
export async function listMerchantsForIdentity(
  identityId: string
): Promise<FinixMerchant[]> {
  const res = await finixFetch<{ _embedded?: { merchants?: FinixMerchant[] } }>(
    `/identities/${identityId}/merchants`
  );
  return res._embedded?.merchants ?? [];
}

/**
 * SANDBOX ONLY: provision a merchant directly through the API — canned
 * underwriting data + Finix's test bank account — skipping the hosted
 * onboarding form. Sandbox auto-approves these in ~2 minutes. Throws in the
 * live environment: real merchants must complete real KYC.
 */
export async function provisionSandboxMerchant(params: {
  businessName: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ identityId: string; merchantId: string; onboardingState: string }> {
  if (finixEnvironment() !== "sandbox") {
    throw new FinixError("Test approval is only available in the sandbox environment.", 400);
  }

  const digitsOnly = (params.phone ?? "").replace(/\D/g, "");
  const identity = await finixFetch<{ id: string }>("/identities", {
    method: "POST",
    body: {
      entity: {
        business_name: params.businessName,
        doing_business_as: params.businessName,
        default_statement_descriptor: params.businessName.slice(0, 20),
        email: params.email || "sandbox-test@workbenchfsm.com",
        business_phone: digitsOnly.length === 10 ? digitsOnly : "2145550100",
        phone: digitsOnly.length === 10 ? digitsOnly : "2145550100",
        // Canned sandbox underwriting data — never sent in live mode
        business_type: "INDIVIDUAL_SOLE_PROPRIETORSHIP",
        business_tax_id: "123456789",
        tax_id: "123456789",
        business_address: { line1: "123 Main St", city: "Dallas", region: "TX", postal_code: "75201", country: "USA" },
        personal_address: { line1: "123 Main St", city: "Dallas", region: "TX", postal_code: "75201", country: "USA" },
        first_name: "Sandbox",
        last_name: "Owner",
        title: "Owner",
        dob: { year: 1985, month: 5, day: 12 },
        incorporation_date: { year: 2015, month: 1, day: 1 },
        principal_percentage_ownership: 100,
        ownership_type: "PRIVATE",
        mcc: "1711",
        annual_card_volume: 12000000,
        max_transaction_amount: maxTransactionCents(),
        url: "https://workbenchfsm.com",
      },
      tags: { sandboxBypass: "true" },
    },
  });

  // Finix's standard test settlement account
  await finixFetch("/payment_instruments", {
    method: "POST",
    body: {
      type: "BANK_ACCOUNT",
      identity: identity.id,
      name: "Sandbox Owner",
      account_number: "0000000016",
      bank_code: "122105278",
      account_type: "BUSINESS_CHECKING",
    },
  });

  const merchant = await finixFetch<FinixMerchant>(`/identities/${identity.id}/merchants`, {
    method: "POST",
    body: { processor: processorName() },
  });

  return {
    identityId: identity.id,
    merchantId: merchant.id,
    onboardingState: merchant.onboarding_state,
  };
}

// ─── Buyers + payment instruments ────────────────────────────────────────────

export async function createBuyerIdentity(params: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  tags?: Record<string, string>;
}): Promise<{ id: string }> {
  return finixFetch<{ id: string }>("/identities", {
    method: "POST",
    body: {
      entity: {
        ...(params.firstName ? { first_name: params.firstName } : {}),
        ...(params.lastName ? { last_name: params.lastName } : {}),
        ...(params.email ? { email: params.email } : {}),
        ...(params.phone ? { phone: params.phone } : {}),
      },
      tags: params.tags ?? {},
    },
  });
}

/** Exchange a finix.js token (TKxxx, 30-min TTL) for a Payment Instrument (PIxxx). */
export async function exchangeToken(params: {
  token: string;
  identityId: string;
}): Promise<{ id: string; instrument_type?: string }> {
  return finixFetch<{ id: string; instrument_type?: string }>(
    "/payment_instruments",
    {
      method: "POST",
      body: { token: params.token, type: "TOKEN", identity: params.identityId },
    }
  );
}

// ─── Transfers (charges) + reversals (refunds) ───────────────────────────────

export interface FinixTransfer {
  id: string;
  state: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  amount: number; // cents
  type: string;
  failure_code: string | null;
  failure_message?: string | null;
  ready_to_settle_at?: string | null; // ~1 business day after the charge
  tags?: Record<string, string>;
}

export async function createTransfer(params: {
  amountCents: number;
  merchantId: string;
  sourceInstrumentId: string;
  idempotencyId: string;
  fraudSessionId?: string;
  tags?: Record<string, string>;
}): Promise<FinixTransfer> {
  return finixFetch<FinixTransfer>("/transfers", {
    method: "POST",
    body: {
      amount: params.amountCents,
      currency: "USD",
      merchant: params.merchantId,
      source: params.sourceInstrumentId,
      idempotency_id: params.idempotencyId,
      ...(params.fraudSessionId ? { fraud_session_id: params.fraudSessionId } : {}),
      tags: params.tags ?? {},
    },
  });
}

export async function getTransfer(id: string): Promise<FinixTransfer> {
  return finixFetch<FinixTransfer>(`/transfers/${id}`);
}

/** All transfers processed under a seller identity (charges, reversals). */
export async function listTransfersForIdentity(
  identityId: string,
  limit = 100
): Promise<FinixTransfer[]> {
  const res = await finixFetch<{ _embedded?: { transfers?: FinixTransfer[] } }>(
    `/transfers?merchant_identity_id=${encodeURIComponent(identityId)}&limit=${limit}`
  );
  return res._embedded?.transfers ?? [];
}

/**
 * Settlement = one payout batch (gross - fees = net to the merchant's bank).
 * Field names vary a little between Finix versions, so consumers should read
 * them tolerantly. Sandbox closes settlements on its own schedule.
 */
export interface FinixSettlement {
  id: string;
  status?: string;
  currency?: string;
  total_amount?: number; // cents, gross
  total_fees?: number; // cents
  net_amount?: number; // cents
  identity?: string;
  merchant_id?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Close the merchant's accruing settlement now instead of waiting for the
 * daily payout cycle ("send to bank now"). Finix approves and funds the closed
 * settlement on its side — approval isn't exposed to platform API keys. Throws
 * FinixError when no cleared transfers are ready to settle.
 */
export async function closeSettlementForIdentity(
  identityId: string
): Promise<FinixSettlement> {
  return finixFetch<FinixSettlement>(`/identities/${identityId}/settlements`, {
    method: "POST",
    body: { currency: "USD", processor: processorName() },
  });
}

/** Funding transfers = the actual bank credit/debit created once a settlement is approved. */
export async function listSettlementFundingTransfers(
  settlementId: string
): Promise<FinixTransfer[]> {
  const res = await finixFetch<{
    _embedded?: { transfers?: FinixTransfer[]; funding_transfers?: FinixTransfer[] };
  }>(`/settlements/${settlementId}/funding_transfers`);
  return res._embedded?.transfers ?? res._embedded?.funding_transfers ?? [];
}

/** Settlements (payout batches) belonging to a single merchant — server-scoped. */
export async function listSettlementsForMerchant(
  merchantId: string,
  limit = 100
): Promise<FinixSettlement[]> {
  const res = await finixFetch<{ _embedded?: { settlements?: FinixSettlement[] } }>(
    `/merchants/${merchantId}/settlements?limit=${limit}`
  );
  return res._embedded?.settlements ?? [];
}

export interface FinixDispute {
  id: string;
  state?: string; // INQUIRY | PENDING | WON | LOST ...
  reason?: string;
  amount?: number; // cents
  transfer?: string; // TRxxx being disputed
  respond_by?: string;
  identity?: string;
  merchant?: string;
  response_state?: string; // NEEDS_RESPONSE | RESPONDED | ...
  created_at?: string;
}

/**
 * Disputes are only listable application-wide (Finix has no merchant-scoped
 * list endpoint), so paginate and let callers filter strictly to their own
 * identity/transfers — never include a dispute whose owner is unknown.
 */
export async function listDisputes(limit = 100): Promise<FinixDispute[]> {
  const disputes: FinixDispute[] = [];
  let path: string | null = `/disputes?limit=${limit}`;
  for (let page = 0; page < 10 && path; page++) {
    const res: {
      _embedded?: { disputes?: FinixDispute[] };
      _links?: { next?: { href?: string } };
    } = await finixFetch(path);
    disputes.push(...(res._embedded?.disputes ?? []));
    const nextHref = res._links?.next?.href;
    const nextPath = nextHref
      ? nextHref.replace(HOSTS[finixEnvironment()], "")
      : null;
    path = nextPath && nextPath !== path ? nextPath : null;
  }
  return disputes;
}

export async function getDispute(id: string): Promise<FinixDispute> {
  return finixFetch<FinixDispute>(`/disputes/${id}`);
}

export interface FinixDisputeEvidence {
  id: string;
  file_name?: string;
  content_type?: string;
  state?: string; // PENDING | SUCCEEDED | FAILED
  created_at?: string;
}

export async function listDisputeEvidence(
  disputeId: string
): Promise<FinixDisputeEvidence[]> {
  const res = await finixFetch<{ _embedded?: { evidences?: FinixDisputeEvidence[] } }>(
    `/disputes/${disputeId}/evidence`
  );
  return res._embedded?.evidences ?? [];
}

/**
 * Upload one evidence file to a dispute. Finix accepts only pdf/jpeg/jpg/png
 * (it sniffs the file contents, not just the declared type).
 */
export async function uploadDisputeEvidence(params: {
  disputeId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
}): Promise<FinixDisputeEvidence> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([params.bytes], { type: params.contentType }),
    params.fileName
  );
  const res = await fetch(
    `${HOSTS[finixEnvironment()]}/disputes/${params.disputeId}/evidence`,
    {
      method: "POST",
      // No Content-Type header — fetch sets the multipart boundary itself
      headers: { Authorization: `Basic ${basicAuth()}` },
      body: form,
    }
  );
  return parseFinixResponse<FinixDisputeEvidence>(res);
}

/** Refund (full or partial) a settled card/ACH transfer. */
export async function reverseTransfer(params: {
  transferId: string;
  refundCents: number;
}): Promise<FinixTransfer> {
  return finixFetch<FinixTransfer>(`/transfers/${params.transferId}/reversals`, {
    method: "POST",
    body: { refund_amount: params.refundCents },
  });
}
