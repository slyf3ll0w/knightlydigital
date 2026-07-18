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
