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

async function finixFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "PUT"; body?: unknown }
): Promise<T> {
  const auth = Buffer.from(
    `${process.env.FINIX_API_USERNAME}:${process.env.FINIX_API_PASSWORD}`
  ).toString("base64");

  const res = await fetch(`${HOSTS[finixEnvironment()]}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

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
