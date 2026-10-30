import { createHmac, timingSafeEqual } from "crypto";

/**
 * Square REST client (OAuth + Payments + Customers + Cards), fetch-based like
 * lib/finix.ts — no SDK, so the bundle and the surface stay small and every
 * request we make is readable here. All amounts in CENTS at this boundary.
 *
 * Environments: `SQUARE_ENVIRONMENT=sandbox|production` picks the host; the
 * app id / secret must match (a sandbox id is `sandbox-sq0idb-…`, production
 * `sq0idp-…`; tokens from one host are UNAUTHORIZED on the other). The web
 * SDK script differs per environment too (lib/pay-config.ts).
 *
 * Two kinds of credentials go on the wire:
 *  - a SELLER's OAuth access token (`Bearer`) for everything that touches
 *    their money — payments, refunds, customers, cards, locations;
 *  - our APPLICATION secret (`Client <secret>`) only for RevokeToken.
 * Webhook subscriptions are made in the Developer Console with the developer
 * token, never from here.
 */

export const SQUARE_API_VERSION = "2025-12-17";

/** The permissions WorkBench asks a seller for. Recorded on the connection at
 *  authorize time (Square can't tell us later what a token carries); adding
 *  one means every seller re-authorizes. Pass `squareScopes()` to the
 *  authorize URL. */
export const SQUARE_SCOPES = [
  "MERCHANT_PROFILE_READ", // ListLocations / RetrieveMerchant (who connected, which location)
  "PAYMENTS_WRITE", // CreatePayment, RefundPayment, CreateCard / DisableCard
  "PAYMENTS_WRITE_IN_PERSON", // Tap to Pay through the Mobile Payments SDK in the phone app (2026-10-22; sellers connected before re-authorize once)
  "PAYMENTS_READ", // GetPayment / GetPaymentRefund (webhook re-fetch), ListCards
  "CUSTOMERS_READ",
  "CUSTOMERS_WRITE", // a Square customer per contact when a card goes on file
  "BANK_ACCOUNTS_READ", // ListBankAccounts: is there a bank account to pay out to? (2026-10-23 — the "add your bank account" nudge)
  "PAYOUTS_READ", // ListPayouts / ListPayoutEntries: the Payouts tab on /app/payments (2026-10-28)
  "DISPUTES_READ", // ListDisputes: the Disputes tab (2026-10-28)
  "DISPUTES_WRITE", // accept a dispute, upload evidence (2026-10-28)
  // 2026-10-30 (docs/plans/square-products-2026-10-30.md): the itemization
  // behind a payment and gift cards sold / checked / redeemed in WorkBench.
  "ORDERS_READ", // RetrieveOrder: the items behind a payment (transaction detail)
  "GIFTCARDS_READ", // ListGiftCards / RetrieveGiftCardFromGAN / activities
  "GIFTCARDS_WRITE", // CreateGiftCard / ACTIVATE / LOAD / link to a customer
] as const;

export function squareScopes(): string[] {
  const extra = (process.env.SQUARE_EXTRA_SCOPES ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set([...SQUARE_SCOPES, ...extra]));
}

export type SquareEnvironment = "sandbox" | "production";

export function squareEnvironment(): SquareEnvironment {
  return process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function squareApplicationId(): string {
  return process.env.SQUARE_APPLICATION_ID ?? "";
}

function squareApplicationSecret(): string {
  return process.env.SQUARE_APPLICATION_SECRET ?? "";
}

/** Square's partner sign-up link for sellers who have no Square account yet
 *  (Settings → Online Payments "Create a Square account"). Unset = the card
 *  just says to create one on Square first. Set SQUARE_SIGNUP_URL to the
 *  link Square's partnerships team issues so new sellers are attributed to
 *  WorkBench; anything but an https URL is ignored. */
export type SquareSignupModel = "companyPaid" | "serviceFee";

/** Square's partner sign-up links (David, 2026-10-23): one per processing
 *  model, because the link decides the Square rate plan the new seller lands
 *  on. company-paid = the business absorbs the fee; service fee = the client
 *  pays it at checkout (Company.surchargeEnabled). SQUARE_SIGNUP_URL /
 *  SQUARE_SIGNUP_URL_SERVICE_FEE override the defaults; anything but an https
 *  URL falls back to the built-in link. */
const SQUARE_SIGNUP_DEFAULTS: Record<SquareSignupModel, string> = {
  companyPaid: "https://squareup.com/i/086C556067",
  serviceFee: "https://squareup.com/i/7002D0C989",
};

export function squareSignupUrl(model: SquareSignupModel = "companyPaid"): string | null {
  const env = model === "serviceFee" ? process.env.SQUARE_SIGNUP_URL_SERVICE_FEE : process.env.SQUARE_SIGNUP_URL;
  const url = (env ?? "").trim();
  return /^https:\/\/\S+$/.test(url) ? url : SQUARE_SIGNUP_DEFAULTS[model];
}

/** True once the app id + secret are set — the processor reports `live`. */
export function squareConfigured(): boolean {
  return Boolean(squareApplicationId() && squareApplicationSecret());
}

export function squareHost(): string {
  return squareEnvironment() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

/** Where Square sends the seller back after consent. Registered in the
 *  Developer Console (OAuth → Redirect URL) per environment; production must
 *  be https. Override with SQUARE_REDIRECT_URL when the console entry differs
 *  from NEXTAUTH_URL (a staging host, a tunnel). */
export function squareRedirectUrl(): string {
  if (process.env.SQUARE_REDIRECT_URL) return process.env.SQUARE_REDIRECT_URL;
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/app/square/callback`;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export type SquareApiError = { category?: string; code?: string; detail?: string; field?: string };

export class SquareError extends Error {
  status: number;
  errors: SquareApiError[];
  constructor(status: number, errors: SquareApiError[], fallback: string) {
    super(errors[0]?.detail || errors[0]?.code || fallback);
    this.name = "SquareError";
    this.status = status;
    this.errors = errors;
  }
  /** First error code — CARD_DECLINED, INSUFFICIENT_FUNDS, ACCESS_TOKEN_REVOKED… */
  get code(): string | null {
    return this.errors[0]?.code ?? null;
  }
  get category(): string | null {
    return this.errors[0]?.category ?? null;
  }
  /** The seller's grant is gone (revoked / expired / wrong environment) —
   *  the connection needs reconnecting, retrying is pointless. */
  get authDead(): boolean {
    const c = this.code;
    return (
      this.status === 401 ||
      c === "ACCESS_TOKEN_REVOKED" ||
      c === "ACCESS_TOKEN_EXPIRED" ||
      c === "UNAUTHORIZED"
    );
  }
}

/** The request never got a verdict: outage, rate limit, timeout, bad
 *  gateway. Autopay treats these as "try again later", never as a decline. */
export function isTransientSquareError(err: unknown): boolean {
  if (err instanceof SquareError) {
    return err.status === 429 || err.status >= 500 || err.code === "RATE_LIMITED";
  }
  if (err instanceof Error) {
    return err.name === "AbortError" || err.name === "TimeoutError" || /fetch failed|ECONNRESET|ETIMEDOUT|socket/i.test(err.message);
  }
  return false;
}

/** Friendly wording for a decline. Square's `detail` is seller-facing
 *  ("Card declined by issuer"); the client-side forms show this instead. */
export function declineMessage(code: string | null | undefined): string {
  switch (code) {
    case "CARD_DECLINED":
    case "GENERIC_DECLINE":
    case "CARD_DECLINED_CALL_ISSUER":
    case "CARD_DECLINED_VERIFICATION_REQUIRED":
      return "The card was declined. Please try another payment method.";
    case "INSUFFICIENT_FUNDS":
    case "INSUFFICIENT_PERMISSIONS":
      return "The payment was declined for insufficient funds.";
    case "CVV_FAILURE":
      return "The security code didn't match. Please check it and try again.";
    case "ADDRESS_VERIFICATION_FAILURE":
      return "The billing address didn't match. Please check it and try again.";
    case "EXPIRATION_FAILURE":
    case "CARD_EXPIRED":
      return "That card has expired. Please use another card.";
    case "INVALID_CARD":
    case "INVALID_CARD_DATA":
    case "INVALID_EXPIRATION":
      return "The card details look wrong. Please check them and try again.";
    case "CARD_NOT_SUPPORTED":
    case "UNSUPPORTED_CARD_BRAND":
      return "That card type isn't accepted here. Please try another card.";
    case "PAYMENT_LIMIT_EXCEEDED":
    case "AMOUNT_TOO_HIGH":
      return "This amount is over the card's limit. Please try another payment method.";
    case "BAD_REQUEST":
    case "INVALID_REQUEST_ERROR":
      return "The payment details couldn't be processed. Please re-enter them and try again.";
    default:
      return "The payment was declined. Please try another payment method.";
  }
}

/** Decline codes that mean "this card will never work" — autopay stops
 *  instead of retrying (lib/auto-charge.ts classifies through this). */
export const HARD_DECLINE_CODES = new Set([
  "CARD_EXPIRED",
  "EXPIRATION_FAILURE",
  "INVALID_CARD",
  "INVALID_CARD_DATA",
  "INVALID_ACCOUNT",
  "CARD_NOT_SUPPORTED",
  "UNSUPPORTED_CARD_BRAND",
  "ACCOUNT_CLOSED",
  "CHIP_INSERTION_REQUIRED",
  "CARD_DECLINED_VERIFICATION_REQUIRED",
]);

// ─── Transport ──────────────────────────────────────────────────────────────

type Auth = { bearer: string } | { client: true } | { none: true };

/** Every Square call goes through here. Exported for the sibling modules
 *  (lib/plan-billing.ts, lib/square-seller-reports.ts) so one transport
 *  carries the version header, the error shape and the timeout. */
export async function squareFetch<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; auth: Auth; timeoutMs?: number }
): Promise<T> {
  const headers: Record<string, string> = {
    "Square-Version": SQUARE_API_VERSION,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if ("bearer" in opts.auth) headers.Authorization = `Bearer ${opts.auth.bearer}`;
  else if ("client" in opts.auth) headers.Authorization = `Client ${squareApplicationSecret()}`;

  const res = await fetch(`${squareHost()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const errors = ((json as { errors?: SquareApiError[] } | null)?.errors ?? []) as SquareApiError[];
    // OAuth endpoints answer with a flat { message, type } instead of errors[]
    const flat = json as { message?: string; type?: string; error_description?: string; error?: string } | null;
    if (!errors.length && flat && (flat.message || flat.error_description || flat.error)) {
      errors.push({ code: flat.type ?? flat.error, detail: flat.message ?? flat.error_description });
    }
    throw new SquareError(res.status, errors, `Square request failed (${res.status})`);
  }
  return (json ?? {}) as T;
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

/** The consent page. `state` is ours (signed, 10-minute); the seller must be
 *  signed in to the Square Dashboard of the right environment in that
 *  browser — in sandbox that means the test account's dashboard open in
 *  another tab (Square's own rule). */
export function buildSquareAuthorizeUrl(params: { state: string; scopes?: string[] }): string {
  const url = new URL("/oauth2/authorize", squareHost());
  url.searchParams.set("client_id", squareApplicationId());
  url.searchParams.set("scope", (params.scopes ?? squareScopes()).join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", squareRedirectUrl());
  // session=false forces a fresh Square login (not supported in sandbox)
  if (squareEnvironment() === "production" && process.env.SQUARE_FORCE_LOGIN === "1") {
    url.searchParams.set("session", "false");
  }
  return url.toString();
}

export interface SquareTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_at: string; // ISO 8601
  merchant_id: string;
  refresh_token?: string; // present on the code grant and on refreshes
  short_lived?: boolean;
  refresh_token_expires_at?: string; // PKCE only
}

/** Code → tokens. The code is single-use and dies after 5 minutes. */
export async function obtainSquareToken(code: string): Promise<SquareTokenResponse> {
  return squareFetch<SquareTokenResponse>("/oauth2/token", {
    auth: { none: true },
    body: {
      client_id: squareApplicationId(),
      client_secret: squareApplicationSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: squareRedirectUrl(),
    },
  });
}

/** A new 30-day access token. The code-flow refresh token itself does not
 *  rotate or expire; Square may still return one — store it when present. */
export async function refreshSquareToken(refreshToken: string): Promise<SquareTokenResponse> {
  return squareFetch<SquareTokenResponse>("/oauth2/token", {
    auth: { none: true },
    body: {
      client_id: squareApplicationId(),
      client_secret: squareApplicationSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
  });
}

/** Revoke every token we hold for a merchant (what Disconnect does). Best
 *  effort: a seller who already revoked us from their dashboard answers 400. */
export async function revokeSquareTokens(params: { merchantId?: string; accessToken?: string }): Promise<void> {
  await squareFetch<{ success?: boolean }>("/oauth2/revoke", {
    auth: { client: true },
    body: {
      client_id: squareApplicationId(),
      ...(params.accessToken ? { access_token: params.accessToken } : {}),
      ...(params.merchantId ? { merchant_id: params.merchantId } : {}),
      revoke_only_access_token: false,
    },
  });
}

// ─── Merchant / locations ───────────────────────────────────────────────────

export interface SquareMerchant {
  id: string;
  business_name?: string;
  country?: string;
  currency?: string;
  status?: "ACTIVE" | "INACTIVE";
  main_location_id?: string;
}

export interface SquareLocation {
  id: string;
  name?: string;
  status?: "ACTIVE" | "INACTIVE";
  currency?: string;
  country?: string;
  capabilities?: string[]; // CREDIT_CARD_PROCESSING, AUTOMATIC_TRANSFERS
  business_name?: string;
  type?: "PHYSICAL" | "MOBILE";
}

export async function retrieveSquareMerchant(token: string): Promise<SquareMerchant> {
  const r = await squareFetch<{ merchant: SquareMerchant }>("/v2/merchants/me", { auth: { bearer: token } });
  return r.merchant;
}

/** Also the "is this token still good?" probe Square recommends. */
export async function listSquareLocations(token: string): Promise<SquareLocation[]> {
  const r = await squareFetch<{ locations?: SquareLocation[] }>("/v2/locations", { auth: { bearer: token } });
  return r.locations ?? [];
}

// ─── Bank accounts (payout readiness) ───────────────────────────────────────

export type SquareBankAccount = {
  id: string;
  /** VERIFICATION_IN_PROGRESS | VERIFIED | DISABLED (permanently unusable). */
  status?: string;
  /** Square can send money to it. */
  creditable?: boolean;
  debitable?: boolean;
  account_type?: string;
  bank_name?: string;
  location_id?: string;
};

/** The bank accounts linked to the seller's Square account. Needs
 *  BANK_ACCOUNTS_READ — a 403 means the grant predates that scope. */
export async function listSquareBankAccounts(token: string): Promise<SquareBankAccount[]> {
  const r = await squareFetch<{ bank_accounts?: SquareBankAccount[] }>("/v2/bank-accounts?limit=100", {
    auth: { bearer: token },
  });
  return r.bank_accounts ?? [];
}

/** Stored on SquareConnection.payoutStatus (lib/square-connection.ts). */
export type SquarePayoutStatus = "VERIFIED" | "PENDING" | "NONE" | "UNKNOWN";

/** Can Square pay this seller out? VERIFIED when any linked account is
 *  verified and creditable; PENDING while Square is still verifying one;
 *  NONE when nothing usable is linked (no account, or only DISABLED ones) —
 *  the state the nudge exists for. */
export function payoutStatusFromBankAccounts(accounts: SquareBankAccount[]): Exclude<SquarePayoutStatus, "UNKNOWN"> {
  if (accounts.some((a) => a.status === "VERIFIED" && a.creditable !== false)) return "VERIFIED";
  if (accounts.some((a) => a.status === "VERIFICATION_IN_PROGRESS")) return "PENDING";
  return "NONE";
}

/** The location payments are recorded under: the merchant's main location
 *  when it's active and can take cards, else the first such location. */
export function pickChargeLocation(locations: SquareLocation[], mainLocationId?: string | null): SquareLocation | null {
  const usable = locations.filter(
    (l) => l.status !== "INACTIVE" && (!l.capabilities || l.capabilities.includes("CREDIT_CARD_PROCESSING"))
  );
  return usable.find((l) => l.id === mainLocationId) ?? usable[0] ?? null;
}

// ─── Payments ───────────────────────────────────────────────────────────────

export interface SquareMoney {
  amount: number; // cents
  currency: string;
}

export interface SquareCardDetails {
  status?: string;
  card?: {
    id?: string;
    card_brand?: string; // VISA, MASTERCARD, AMERICAN_EXPRESS, DISCOVER, …
    last_4?: string;
    exp_month?: number;
    exp_year?: number;
    card_type?: string; // CREDIT | DEBIT | UNKNOWN
    prepaid_type?: string;
    bin?: string;
  };
  entry_method?: string;
  avs_status?: string;
  cvv_status?: string;
}

export interface SquarePayment {
  id: string;
  status: "APPROVED" | "PENDING" | "COMPLETED" | "CANCELED" | "FAILED";
  amount_money: SquareMoney;
  source_type?: "CARD" | "BANK_ACCOUNT" | "WALLET" | "CASH" | "EXTERNAL" | string;
  card_details?: SquareCardDetails;
  bank_account_details?: { bank_name?: string; transfer_type?: string; account_ownership_type?: string; ach_details?: { routing_number?: string; account_number_suffix?: string; account_type?: string } };
  location_id?: string;
  customer_id?: string;
  reference_id?: string;
  note?: string;
  processing_fee?: { effective_at?: string; type?: string; amount_money?: SquareMoney }[];
  refunded_money?: SquareMoney;
  delay_action?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateSquarePaymentParams {
  token: string;
  idempotencyKey: string;
  /** A one-time Web Payments SDK token (cnon:… / bauth:…) or a card on file (ccof:…). */
  sourceId: string;
  amountCents: number;
  currency?: string;
  locationId?: string | null;
  /** Required when sourceId is a card on file. */
  customerId?: string | null;
  referenceId?: string | null;
  note?: string | null;
  /** Rides on the payment as Square's `buyer_email_address` (receipts). */
  buyerEmail?: string | null;
}

/** Square idempotency keys are ≤45 chars; ours are built from cuids and
 *  counters that can run longer. Same input → same key, always. */
export function squareIdempotencyKey(raw: string): string {
  if (raw.length <= 45) return raw;
  return createHmac("sha256", "wb-square-idem").update(raw).digest("hex").slice(0, 45);
}

export async function createSquarePayment(params: CreateSquarePaymentParams): Promise<SquarePayment> {
  const r = await squareFetch<{ payment: SquarePayment }>("/v2/payments", {
    auth: { bearer: params.token },
    body: {
      idempotency_key: squareIdempotencyKey(params.idempotencyKey),
      source_id: params.sourceId,
      amount_money: { amount: params.amountCents, currency: params.currency ?? "USD" },
      autocomplete: true,
      ...(params.locationId ? { location_id: params.locationId } : {}),
      ...(params.customerId ? { customer_id: params.customerId } : {}),
      ...(params.referenceId ? { reference_id: params.referenceId.slice(0, 40) } : {}),
      ...(params.note ? { note: params.note.slice(0, 500) } : {}),
      ...(params.buyerEmail ? { buyer_email_address: params.buyerEmail } : {}),
    },
    timeoutMs: 25_000,
  });
  return r.payment;
}

export async function getSquarePayment(token: string, paymentId: string): Promise<SquarePayment> {
  const r = await squareFetch<{ payment: SquarePayment }>(`/v2/payments/${encodeURIComponent(paymentId)}`, {
    auth: { bearer: token },
  });
  return r.payment;
}

export interface SquareRefund {
  id: string;
  status: "PENDING" | "COMPLETED" | "REJECTED" | "FAILED";
  amount_money: SquareMoney;
  payment_id?: string;
  reason?: string;
  created_at?: string;
}

export async function refundSquarePayment(params: {
  token: string;
  idempotencyKey: string;
  paymentId: string;
  amountCents: number;
  currency?: string;
  reason?: string | null;
}): Promise<SquareRefund> {
  const r = await squareFetch<{ refund: SquareRefund }>("/v2/refunds", {
    auth: { bearer: params.token },
    body: {
      idempotency_key: squareIdempotencyKey(params.idempotencyKey),
      payment_id: params.paymentId,
      amount_money: { amount: params.amountCents, currency: params.currency ?? "USD" },
      ...(params.reason ? { reason: params.reason.slice(0, 192) } : {}),
    },
    timeoutMs: 25_000,
  });
  return r.refund;
}

export async function getSquareRefund(token: string, refundId: string): Promise<SquareRefund> {
  const r = await squareFetch<{ refund: SquareRefund }>(`/v2/refunds/${encodeURIComponent(refundId)}`, {
    auth: { bearer: token },
  });
  return r.refund;
}

// ─── Customers + cards on file ──────────────────────────────────────────────

export interface SquareCustomer {
  id: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
}

export async function createSquareCustomer(params: {
  token: string;
  idempotencyKey: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  referenceId?: string | null;
}): Promise<SquareCustomer> {
  const r = await squareFetch<{ customer: SquareCustomer }>("/v2/customers", {
    auth: { bearer: params.token },
    body: {
      idempotency_key: squareIdempotencyKey(params.idempotencyKey),
      ...(params.firstName ? { given_name: params.firstName } : {}),
      ...(params.lastName ? { family_name: params.lastName } : {}),
      ...(params.email ? { email_address: params.email } : {}),
      // Square validates phone numbers strictly; a bad one fails the whole
      // create, so it's omitted rather than risked.
      ...(params.referenceId ? { reference_id: params.referenceId } : {}),
    },
  });
  return r.customer;
}

export interface SquareCard {
  id: string; // ccof:…
  card_brand?: string;
  last_4?: string;
  exp_month?: number;
  exp_year?: number;
  card_type?: string;
  cardholder_name?: string;
  customer_id?: string;
  enabled?: boolean;
}

/** Vault a card from a one-time token (no charge). */
export async function createSquareCard(params: {
  token: string;
  idempotencyKey: string;
  sourceId: string;
  customerId: string;
  cardholderName?: string | null;
  referenceId?: string | null;
}): Promise<SquareCard> {
  const r = await squareFetch<{ card: SquareCard }>("/v2/cards", {
    auth: { bearer: params.token },
    body: {
      idempotency_key: squareIdempotencyKey(params.idempotencyKey),
      source_id: params.sourceId,
      card: {
        customer_id: params.customerId,
        ...(params.cardholderName ? { cardholder_name: params.cardholderName } : {}),
        ...(params.referenceId ? { reference_id: params.referenceId } : {}),
      },
    },
  });
  return r.card;
}

export async function retrieveSquareCard(token: string, cardId: string): Promise<SquareCard> {
  const r = await squareFetch<{ card: SquareCard }>(`/v2/cards/${encodeURIComponent(cardId)}`, {
    auth: { bearer: token },
  });
  return r.card;
}

export async function disableSquareCard(token: string, cardId: string): Promise<void> {
  await squareFetch<{ card: SquareCard }>(`/v2/cards/${encodeURIComponent(cardId)}/disable`, {
    auth: { bearer: token },
    method: "POST",
    body: {},
  });
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

/** Square signs `notificationUrl + rawBody` with the subscription's
 *  signature key (HMAC-SHA256, base64) in `x-square-hmacsha256-signature`.
 *  The URL must be byte-for-byte the one on the subscription. */
export function verifySquareWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  notificationUrl: string;
  signatureKey?: string;
}): boolean {
  const key = params.signatureKey ?? process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  if (!key || !params.signatureHeader) return false;
  const expected = createHmac("sha256", key).update(params.notificationUrl + params.rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(params.signatureHeader, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface SquareWebhookEvent {
  merchant_id?: string;
  type?: string; // payment.updated, refund.updated, oauth.authorization.revoked, …
  event_id?: string;
  created_at?: string;
  data?: { type?: string; id?: string; object?: Record<string, unknown> };
}
