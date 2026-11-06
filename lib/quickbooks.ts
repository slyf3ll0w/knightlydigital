import { reportError } from "@/lib/report-error";
/**
 * QuickBooks Online integration (Phase 1: one-way push).
 *
 * What syncs, and when:
 *  - Contact → QBO Customer, Invoice (non-draft) → QBO Invoice,
 *    Payment → QBO Payment — pushed by `syncCompany()` (the Settings
 *    "Sync now" button + nightly cron sweep) and opportunistically by
 *    `queueQuickBooksPaymentSync()` right after a payment is recorded.
 *  - One-way only: nothing in QuickBooks writes back into the Hub.
 *
 * What UNSYNCS, and when. Pushing alone leaves the books diverging the moment
 * money stops existing here — a refunded, bounced or deleted payment used to
 * sit in QuickBooks forever, so QBO called an invoice paid while WorkBench
 * called it open, and nobody found out until a reconciliation:
 *  - payment deleted, or an ACH debit returned by the bank → the QBO payment
 *    is deleted (`queueQuickBooksUnwind`)
 *  - invoice deleted, or a client force-deleted with their billing history →
 *    its payments come off first, then the invoice
 *    (`queueQuickBooksInvoiceUnwind`); the QBO customer stays, since QBO
 *    won't delete a customer with history and accountants want the name
 *  - payment refunded → the QBO payment keeps what the client actually paid
 *    and a RefundReceipt books the money going back out, so the deposit and
 *    the refund each match a bank-feed line (`queueQuickBooksPaymentRefresh`,
 *    `pushRefund`); a refund the processor later rejects comes back off
 *  - invoice archived with nothing paid on it → the QBO invoice is VOIDED,
 *    not deleted: archiving shelves the paper here, so the number and the
 *    record stay in QuickBooks with the amounts at zero and it stops being
 *    a receivable; reopening restores the lines (`pushInvoice`)
 * All of these are fire-and-forget and never block (or fail) the user's
 * action; failures are logged and the record simply stays in QuickBooks.
 * Deleting rather than voiding mirrors what the user did here.
 *
 * Invoices also push the moment they change hands — marked sent, edited,
 * archived, reopened, opened by the client (`queueQuickBooksInvoiceSync`) —
 * so a bookkeeper watching QuickBooks sees it in seconds, not at the sweep.
 *
 * Connection lifecycle: OAuth2 against Intuit. Access tokens last 1 hour
 * (auto-refreshed here), refresh tokens roll for ~100 days — an idle
 * connection past that must be reconnected from Settings. Tokens are
 * AES-256-GCM encrypted at rest with a key derived from AUTH_SECRET.
 *
 * Env vars (all optional — integration is invisible until set):
 *   QBO_CLIENT_ID / QBO_CLIENT_SECRET  — Intuit app keys
 *   QBO_ENVIRONMENT                    — "sandbox" (default) | "production"
 * The OAuth redirect URI is `${NEXTAUTH_URL}/api/app/quickbooks/callback`
 * and must be registered verbatim in the Intuit developer portal.
 *
 * Known Phase 1 simplifications (documented in Settings copy too):
 *  - All invoice lines bill against one generic "WorkBench Services"
 *    item (Jobber's default behavior) — per-WorkItem item sync is Phase 2.
 *  - Tax is pushed as an invoice-level total (all lines marked TAX when the
 *    invoice has tax); QBO Automated Sales Tax may recalculate it.
 *  - Card surcharges live on the Payment row here, not the invoice, so they
 *    are noted in the QBO payment memo rather than booked as income.
 *  - Invoice numbers only match in QuickBooks when the company has "Custom
 *    transaction numbers" on (Settings → Sales); otherwise QBO numbers them.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma, QuickBooksConnection, QuickBooksEntityType } from "@prisma/client";

// ─── Config ──────────────────────────────────────────────────────────────────

const OAUTH_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const OAUTH_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const OAUTH_SCOPE = "com.intuit.quickbooks.accounting";
const MINOR_VERSION = "75";
/** The generic Service item all invoice lines bill against (Phase 1). */
const DEFAULT_ITEM_NAME = "WorkBench Services";
/** Card surcharges get their own item so fees are visible in QBO reports. */
const SURCHARGE_ITEM_NAME = "Card Processing Surcharges";
/** Fallback expense account for pushed expenses when none matches. */
const EXPENSE_ACCOUNT_NAME = "WorkBench Expenses";
/** Per-run cap so a huge first sync can't run away; the next run continues. */
const SYNC_BATCH_LIMIT = 100;

export function isQuickBooksConfigured(): boolean {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

export function quickBooksEnvironment(): "sandbox" | "production" {
  return process.env.QBO_ENVIRONMENT === "production" ? "production" : "sandbox";
}

function apiBaseUrl(): string {
  return quickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/app/quickbooks/callback`;
}

function basicAuthHeader(): string {
  const raw = `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

// ─── Token encryption (AES-256-GCM, key derived from AUTH_SECRET) ────────────

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to store QuickBooks tokens");
  return createHash("sha256").update(`qbo-token:${secret}`).digest();
}

function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

function decryptToken(stored: string): string {
  const [version, iv, tag, ct] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized token format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

// ─── OAuth: authorize URL + signed state ─────────────────────────────────────

// state = companyId.userId.expiresAtMs.hmac — self-contained, 10-minute
// lifetime. The state IS the identity at the callback: from the native shell
// Intuit's consent screen opens in the system browser, which has no
// WorkBench session, so the callback can't require one (that requirement is
// what turned "Connect" into "error unauthorized" on a phone). The callback
// re-checks that the user in the state is still an active manager of that
// company, and cross-checks any session that IS present against it.
function stateSignature(companyId: string, userId: string, expiresAt: number): string {
  return createHmac("sha256", encryptionKey())
    .update(`${companyId}.${userId}.${expiresAt}`)
    .digest("hex");
}

export type OAuthState = { companyId: string; userId: string };

export function buildAuthorizeUrl(companyId: string, userId: string): string {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const state = `${companyId}.${userId}.${expiresAt}.${stateSignature(companyId, userId, expiresAt)}`;
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID ?? "",
    response_type: "code",
    scope: OAUTH_SCOPE,
    redirect_uri: redirectUri(),
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export function verifyState(state: string): OAuthState | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [companyId, userId, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!companyId || !userId || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return sig === stateSignature(companyId, userId, expiresAt) ? { companyId, userId } : null;
}

// ─── OAuth: token exchange / refresh / revoke ────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (access token, typically 3600)
  x_refresh_token_expires_in: number; // seconds (~100 days)
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Intuit token endpoint ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

function tokenDataFromResponse(tokens: TokenResponse) {
  const now = Date.now();
  return {
    accessTokenEnc: encryptToken(tokens.access_token),
    refreshTokenEnc: encryptToken(tokens.refresh_token),
    accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now + tokens.x_refresh_token_expires_in * 1000),
  };
}

/** Callback step: trade the auth code for tokens and create/replace the connection. */
export async function connectCompany(params: {
  companyId: string;
  code: string;
  realmId: string;
}): Promise<QuickBooksConnection> {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: redirectUri(),
    })
  );
  const data = { realmId: params.realmId, lastSyncError: null, ...tokenDataFromResponse(tokens) };
  const connection = await prisma.quickBooksConnection.upsert({
    where: { companyId: params.companyId },
    create: { companyId: params.companyId, ...data },
    update: data,
  });

  // Best-effort: grab the QBO company name for the settings page.
  try {
    const info = await qboGet(connection, `companyinfo/${params.realmId}`);
    const name = (info as { CompanyInfo?: { CompanyName?: string } }).CompanyInfo?.CompanyName;
    if (name) {
      return await prisma.quickBooksConnection.update({
        where: { id: connection.id },
        data: { qboCompanyName: name },
      });
    }
  } catch (err) {
    reportError("[quickbooks] companyinfo fetch failed", err);
  }
  return connection;
}

/** Disconnect: revoke the grant at Intuit, then drop the connection + mappings. */
export async function disconnectCompany(companyId: string): Promise<void> {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!connection) return;
  try {
    await fetch(OAUTH_REVOKE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token: decryptToken(connection.refreshTokenEnc) }),
    });
  } catch (err) {
    reportError("[quickbooks] token revoke failed (connection still deleted)", err);
  }
  await prisma.quickBooksConnection.delete({ where: { id: connection.id } });
}

/**
 * Returns a fresh access token, refreshing (and persisting) when the stored
 * one is within 2 minutes of expiry. Throws with a reconnect-worthy message
 * when the refresh token itself is dead.
 */
async function freshAccessToken(connection: QuickBooksConnection): Promise<string> {
  if (connection.accessTokenExpiresAt.getTime() - Date.now() > 2 * 60 * 1000) {
    return decryptToken(connection.accessTokenEnc);
  }
  let tokens: TokenResponse;
  try {
    tokens = await requestTokens(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptToken(connection.refreshTokenEnc),
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Intuit answers `invalid_grant` (a 400) when the refresh token itself is
    // dead — the owner disconnected us from inside QuickBooks, or the token
    // idled past ~100 days. Nothing here ever gets told about a QuickBooks-side
    // disconnect (Intuit's Disconnect URL is just a browser landing page), so
    // this failure IS the notification. Expire the connection so the settings
    // page flips to its "reconnect" banner instead of looking healthy while
    // every sync quietly fails. Transient failures (5xx, network) fall through
    // untouched — they don't cost anyone their connection.
    if (/invalid_grant/i.test(message)) {
      await prisma.quickBooksConnection
        .update({
          where: { id: connection.id },
          data: {
            refreshTokenExpiresAt: new Date(),
            lastSyncError:
              "QuickBooks revoked this connection (disconnected from the QuickBooks side, or idle too long).",
          },
        })
        .catch(() => {});
    }
    throw new Error(
      `QuickBooks session expired — reconnect from Settings → QuickBooks. (${message})`
    );
  }
  const data = tokenDataFromResponse(tokens);
  Object.assign(connection, data);

  // Intuit ROTATES the refresh token on use: the one we just spent is dead
  // the moment the call above succeeds, so failing to store the replacement
  // permanently breaks the connection — the only recovery is the owner
  // reconnecting from Settings. A transient database blip is not a good
  // enough reason to cost someone their QuickBooks integration, so retry the
  // write, and if it still won't land, say exactly what happened instead of
  // surfacing a raw database error.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.quickBooksConnection.update({ where: { id: connection.id }, data });
      break;
    } catch (err) {
      if (attempt >= 2) {
        reportError(
          "[quickbooks] CRITICAL: refreshed token could not be saved — this connection now needs reconnecting",
          { companyId: connection.companyId, error: err }
        );
        throw new Error(
          "QuickBooks session couldn't be saved — reconnect from Settings → QuickBooks."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  return tokens.access_token;
}

// ─── QBO REST helpers ────────────────────────────────────────────────────────

type QboEntity = Record<string, unknown>;

class QboApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}

async function qboRequest(
  connection: QuickBooksConnection,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<QboEntity> {
  const token = await freshAccessToken(connection);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${apiBaseUrl()}/v3/company/${connection.realmId}/${path}${sep}minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new QboApiError(`QBO ${method} ${path} → ${res.status}`, res.status, text.slice(0, 600));
  }
  return text ? (JSON.parse(text) as QboEntity) : {};
}

function qboGet(connection: QuickBooksConnection, path: string) {
  return qboRequest(connection, "GET", path);
}

function qboPost(connection: QuickBooksConnection, path: string, body: unknown) {
  return qboRequest(connection, "POST", path, body);
}

/**
 * Read one QBO entity by id. Returns null when QBO no longer has it (deleted
 * over there, or never really created) — the caller treats that as "already
 * gone" rather than an error, which is what makes unwinding idempotent.
 */
export async function fetchQboEntity(
  connection: QuickBooksConnection,
  entity: string,
  qboId: string
): Promise<QboEntity | null> {
  try {
    const data = await qboGet(connection, `${entity}/${encodeURIComponent(qboId)}`);
    const key = entity.charAt(0).toUpperCase() + entity.slice(1);
    return (data[key] as QboEntity | undefined) ?? null;
  } catch (err) {
    if (err instanceof QboApiError && (err.status === 400 || err.status === 404)) return null;
    throw err;
  }
}

/**
 * Delete a QBO entity. QBO requires the current SyncToken (its optimistic
 * lock), and ours can be stale if anyone touched the record in QuickBooks, so
 * the caller passes one freshly read via fetchQboEntity.
 */
function qboDelete(connection: QuickBooksConnection, entity: string, id: string, syncToken: string) {
  return qboRequest(connection, "POST", `${entity}?operation=delete`, {
    Id: id,
    SyncToken: syncToken,
  });
}

/**
 * Void (not delete) a QBO transaction: the amounts go to zero and "Voided"
 * lands on the memo, but the record and its number stay as the paper trail.
 * Same fresh-SyncToken rule as delete.
 */
function qboVoid(connection: QuickBooksConnection, entity: string, id: string, syncToken: string) {
  return qboRequest(connection, "POST", `${entity}?operation=void`, {
    Id: id,
    SyncToken: syncToken,
  });
}

/** QBO's URL path for each entity type we map. */
const QBO_ENTITY_PATH: Record<QuickBooksEntityType, string> = {
  CUSTOMER: "customer",
  INVOICE: "invoice",
  PAYMENT: "payment",
  ESTIMATE: "estimate",
  PURCHASE: "purchase",
  REFUND: "refundreceipt",
};

/** Run a QBO SQL-ish query; returns the entity array (possibly empty). */
async function qboQuery(
  connection: QuickBooksConnection,
  entity: string,
  query: string
): Promise<QboEntity[]> {
  const data = await qboGet(connection, `query?query=${encodeURIComponent(query)}`);
  const response = data.QueryResponse as Record<string, unknown> | undefined;
  return (response?.[entity] as QboEntity[] | undefined) ?? [];
}

/** Escape a string literal for a QBO query (single quotes double up). */
function q(value: string): string {
  return value.replace(/'/g, "\\'");
}

function money(value: Prisma.Decimal | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Sync-record bookkeeping ─────────────────────────────────────────────────

async function getSyncRecord(companyId: string, entityType: QuickBooksEntityType, localId: string) {
  return prisma.quickBooksSyncRecord.findUnique({
    where: { companyId_entityType_localId: { companyId, entityType, localId } },
  });
}

async function saveSyncRecord(params: {
  connection: QuickBooksConnection;
  entityType: QuickBooksEntityType;
  localId: string;
  qboId: string;
  qboSyncToken?: string | null;
  localUpdatedAt?: Date | null;
  /** When WorkBench voided the QBO record; omitted = not voided (clears a prior void). */
  voidedAt?: Date | null;
}) {
  const data = {
    qboId: params.qboId,
    qboSyncToken: params.qboSyncToken ?? null,
    status: "SYNCED" as const,
    error: null,
    localUpdatedAt: params.localUpdatedAt ?? null,
    voidedAt: params.voidedAt ?? null,
    lastSyncedAt: new Date(),
  };
  return prisma.quickBooksSyncRecord.upsert({
    where: {
      companyId_entityType_localId: {
        companyId: params.connection.companyId,
        entityType: params.entityType,
        localId: params.localId,
      },
    },
    create: {
      connectionId: params.connection.id,
      companyId: params.connection.companyId,
      entityType: params.entityType,
      localId: params.localId,
      ...data,
    },
    update: data,
  });
}

async function saveSyncError(
  connection: QuickBooksConnection,
  entityType: QuickBooksEntityType,
  localId: string,
  err: unknown
) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 800);
  const detail = err instanceof QboApiError ? ` ${err.body.slice(0, 400)}` : "";
  await prisma.quickBooksSyncRecord.upsert({
    where: {
      companyId_entityType_localId: {
        companyId: connection.companyId,
        entityType,
        localId,
      },
    },
    create: {
      connectionId: connection.id,
      companyId: connection.companyId,
      entityType,
      localId,
      status: "ERROR",
      error: `${message}${detail}`,
      lastSyncedAt: new Date(),
    },
    update: { status: "ERROR", error: `${message}${detail}`, lastSyncedAt: new Date() },
  });
}

// ─── Entity push: Customer ───────────────────────────────────────────────────

/**
 * Ensure the contact exists as a QBO Customer; returns its QBO id.
 * Re-pushes contact edits (sparse update) when our row is newer than the
 * last sync. QBO DisplayName is unique across customers/vendors/employees,
 * so a name collision falls back to adopting the existing customer.
 */
async function ensureCustomer(connection: QuickBooksConnection, contactId: string): Promise<string> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: connection.companyId },
  });
  if (!contact) throw new Error("Contact not found");

  const record = await getSyncRecord(connection.companyId, "CUSTOMER", contactId);
  if (
    record?.qboId &&
    record.status === "SYNCED" &&
    record.localUpdatedAt &&
    contact.updatedAt <= record.localUpdatedAt
  ) {
    return record.qboId;
  }

  const displayName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "Unnamed client";
  const payload: QboEntity = {
    DisplayName: displayName,
    GivenName: contact.firstName || undefined,
    FamilyName: contact.lastName || undefined,
    CompanyName: contact.companyName || undefined,
    PrimaryEmailAddr: contact.email ? { Address: contact.email } : undefined,
    PrimaryPhone: contact.phone ? { FreeFormNumber: contact.phone } : undefined,
    BillAddr:
      contact.address || contact.city || contact.state || contact.zip
        ? {
            Line1: contact.address || undefined,
            City: contact.city || undefined,
            CountrySubDivisionCode: contact.state || undefined,
            PostalCode: contact.zip || undefined,
          }
        : undefined,
  };

  let result: QboEntity;
  if (record?.qboId) {
    // Sparse update needs the current SyncToken; re-read to avoid staleness.
    const current = await qboGet(connection, `customer/${record.qboId}`);
    const existing = current.Customer as QboEntity;
    result = await qboPost(connection, "customer", {
      ...payload,
      Id: record.qboId,
      SyncToken: existing.SyncToken,
      sparse: true,
    });
  } else {
    // Adopt an existing QBO customer with the same display name rather than
    // erroring on QBO's uniqueness rule.
    const matches = await qboQuery(
      connection,
      "Customer",
      `select Id, SyncToken from Customer where DisplayName = '${q(displayName)}'`
    );
    if (matches.length > 0) {
      result = { Customer: matches[0] };
    } else {
      result = await qboPost(connection, "customer", payload);
    }
  }

  const customer = result.Customer as { Id: string; SyncToken?: string };
  await saveSyncRecord({
    connection,
    entityType: "CUSTOMER",
    localId: contactId,
    qboId: customer.Id,
    qboSyncToken: customer.SyncToken,
    localUpdatedAt: contact.updatedAt,
  });
  return customer.Id;
}

// ─── Entity push: default Service item ───────────────────────────────────────

/**
 * Phase 1 bills every invoice line against one generic Service item,
 * created on demand and cached on the connection. Needs an income account —
 * the first Income-type account in their chart wins (prefer "Services").
 */
async function ensureDefaultItem(connection: QuickBooksConnection): Promise<string> {
  if (connection.defaultItemId) return connection.defaultItemId;

  const existing = await qboQuery(
    connection,
    "Item",
    `select Id from Item where Name = '${q(DEFAULT_ITEM_NAME)}'`
  );
  let itemId: string;
  if (existing.length > 0) {
    itemId = (existing[0] as { Id: string }).Id;
  } else {
    const accounts = await qboQuery(
      connection,
      "Account",
      "select Id, Name from Account where AccountType = 'Income' maxresults 50"
    );
    if (accounts.length === 0) {
      throw new Error("No income account found in this QuickBooks company — add one in QuickBooks first.");
    }
    const preferred =
      accounts.find((a) => /service/i.test(String(a.Name))) ??
      accounts.find((a) => /sales/i.test(String(a.Name))) ??
      accounts[0];
    const created = await qboPost(connection, "item", {
      Name: DEFAULT_ITEM_NAME,
      Type: "Service",
      IncomeAccountRef: { value: (preferred as { Id: string }).Id },
    });
    itemId = (created.Item as { Id: string }).Id;
  }

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { defaultItemId: itemId },
  });
  connection.defaultItemId = itemId;
  return itemId;
}

/**
 * The Service item card surcharges bill against — separate from the generic
 * services item so processing-fee income shows up as its own line on QBO
 * P&L reports instead of inflating service revenue. Prefers an income
 * account that looks fee-shaped; otherwise rides the same account as the
 * default item.
 */
async function ensureSurchargeItem(connection: QuickBooksConnection): Promise<string> {
  if (connection.surchargeItemId) return connection.surchargeItemId;

  const existing = await qboQuery(
    connection,
    "Item",
    `select Id from Item where Name = '${q(SURCHARGE_ITEM_NAME)}'`
  );
  let itemId: string;
  if (existing.length > 0) {
    itemId = (existing[0] as { Id: string }).Id;
  } else {
    const accounts = await qboQuery(
      connection,
      "Account",
      "select Id, Name from Account where AccountType = 'Income' maxresults 50"
    );
    if (accounts.length === 0) {
      throw new Error("No income account found in this QuickBooks company — add one in QuickBooks first.");
    }
    const preferred =
      accounts.find((a) => /surcharge|processing|fee/i.test(String(a.Name))) ??
      accounts.find((a) => /service/i.test(String(a.Name))) ??
      accounts[0];
    const created = await qboPost(connection, "item", {
      Name: SURCHARGE_ITEM_NAME,
      Type: "Service",
      IncomeAccountRef: { value: (preferred as { Id: string }).Id },
    });
    itemId = (created.Item as { Id: string }).Id;
  }

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { surchargeItemId: itemId },
  });
  connection.surchargeItemId = itemId;
  return itemId;
}

// ─── Entity push: Invoice ────────────────────────────────────────────────────

type InvoiceSyncRecord = NonNullable<Awaited<ReturnType<typeof getSyncRecord>>>;

/**
 * An invoice archived here is shelved — "wrong invoice, client bailed" — so
 * QuickBooks has to stop counting it as money owed, or the bookkeeper's
 * receivables carry a balance WorkBench stopped chasing long ago.
 *
 * Rules, cheapest first:
 *  - never pushed → nothing to void, and nothing to push: a shelved invoice
 *    is not a receivable (returns null, and the sweep doesn't retry it)
 *  - already voided, or nothing changed since → done
 *  - money was recorded against it → the paid part is real, so the QBO
 *    invoice stays exactly as it is (voiding would unapply the payment)
 *  - otherwise → VOID it in QuickBooks. Void, not delete: archiving keeps
 *    the paper trail here, so the number and the record stay there too,
 *    with the amounts at zero. Reopening pushes the lines back
 *    (`pushInvoice`'s update path), which clears `voidedAt`.
 */
async function voidArchivedInvoice(
  connection: QuickBooksConnection,
  invoice: { id: string; updatedAt: Date },
  record: InvoiceSyncRecord | null
): Promise<string | null> {
  if (!record?.qboId) return null;
  if (
    record.status === "SYNCED" &&
    record.localUpdatedAt &&
    invoice.updatedAt <= record.localUpdatedAt
  ) {
    return record.qboId;
  }
  const base = { connection, entityType: "INVOICE" as const, localId: invoice.id, qboId: record.qboId };
  if (record.voidedAt) {
    await saveSyncRecord({ ...base, qboSyncToken: record.qboSyncToken, localUpdatedAt: invoice.updatedAt, voidedAt: record.voidedAt });
    return record.qboId;
  }
  const paid = await prisma.payment.count({ where: { invoiceId: invoice.id } });
  if (paid > 0) {
    await saveSyncRecord({ ...base, qboSyncToken: record.qboSyncToken, localUpdatedAt: invoice.updatedAt });
    return record.qboId;
  }
  const remote = await fetchQboEntity(connection, "invoice", record.qboId);
  if (!remote) {
    // Gone from QuickBooks already — nothing to void, nothing to remember.
    await prisma.quickBooksSyncRecord.delete({ where: { id: record.id } }).catch(() => {});
    return null;
  }
  const result = await qboVoid(
    connection,
    "invoice",
    record.qboId,
    String(remote.SyncToken ?? record.qboSyncToken ?? "0")
  );
  const voided = result.Invoice as { SyncToken?: string } | undefined;
  await saveSyncRecord({
    ...base,
    qboSyncToken: voided?.SyncToken ?? null,
    localUpdatedAt: invoice.updatedAt,
    voidedAt: new Date(),
  });
  return record.qboId;
}

/**
 * Push one invoice (create or sparse update). Drafts are skipped — QBO only
 * hears about invoices once they're real; archived ones are voided over
 * there (see voidArchivedInvoice). Returns the QBO invoice id, or null when
 * the invoice isn't syncable (draft / no client / archived and never sent).
 */
export async function pushInvoice(
  connection: QuickBooksConnection,
  invoiceId: string
): Promise<string | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: connection.companyId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "DRAFT") return null;
  if (!invoice.contactId) return null; // no client to bill against

  const record = await getSyncRecord(connection.companyId, "INVOICE", invoiceId);
  if (invoice.status === "ARCHIVED") return voidArchivedInvoice(connection, invoice, record);
  if (
    record?.qboId &&
    record.status === "SYNCED" &&
    record.localUpdatedAt &&
    invoice.updatedAt <= record.localUpdatedAt
  ) {
    return record.qboId;
  }

  const customerId = await ensureCustomer(connection, invoice.contactId);
  const itemId = await ensureDefaultItem(connection);
  const taxable = money(invoice.tax) > 0;

  const lines: QboEntity[] = invoice.lineItems.map((li) => ({
    DetailType: "SalesItemLineDetail",
    Amount: money(li.total),
    Description: [li.name, li.description].filter(Boolean).join(" — ").slice(0, 4000) || undefined,
    SalesItemLineDetail: {
      ItemRef: { value: itemId },
      Qty: Number(li.quantity),
      UnitPrice: money(li.unitPrice),
      TaxCodeRef: { value: taxable ? "TAX" : "NON" },
      ...(li.serviceDate ? { ServiceDate: dateOnly(li.serviceDate) } : {}),
    },
  }));
  if (money(invoice.discount) > 0) {
    lines.push({
      DetailType: "DiscountLineDetail",
      Amount: money(invoice.discount),
      DiscountLineDetail: { PercentBased: false },
    });
  }
  // The deposit was invoiced (and synced) separately, so net it off here to
  // keep QBO's receivable equal to what the client actually still owes.
  if (money(invoice.depositApplied) > 0) {
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: -money(invoice.depositApplied),
      Description: "Deposit applied",
      SalesItemLineDetail: { ItemRef: { value: itemId }, TaxCodeRef: { value: "NON" } },
    });
  }
  if (money(invoice.surcharge) > 0) {
    // Own item → own income line in QBO reports, not buried in services
    const surchargeItemId = await ensureSurchargeItem(connection);
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: money(invoice.surcharge),
      Description: "Card processing surcharge",
      SalesItemLineDetail: { ItemRef: { value: surchargeItemId }, TaxCodeRef: { value: "NON" } },
    });
  }

  const payload: QboEntity = {
    CustomerRef: { value: customerId },
    DocNumber: String(invoice.invoiceNumber),
    TxnDate: dateOnly(invoice.issuedAt ?? invoice.createdAt),
    ...(invoice.dueDate ? { DueDate: dateOnly(invoice.dueDate) } : {}),
    Line: lines,
    ...(taxable ? { TxnTaxDetail: { TotalTax: money(invoice.tax) } } : {}),
    PrivateNote: `Synced from WorkBench (invoice #${invoice.invoiceNumber})`.slice(0, 4000),
  };

  let result: QboEntity;
  if (record?.qboId) {
    // Also the reopen path: a voided invoice gets its lines written back,
    // and saveSyncRecord below clears voidedAt.
    const current = await qboGet(connection, `invoice/${record.qboId}`);
    const existing = current.Invoice as QboEntity;
    result = await qboPost(connection, "invoice", {
      ...payload,
      Id: record.qboId,
      SyncToken: existing.SyncToken,
      sparse: true,
    });
  } else {
    const matches = await qboQuery(
      connection,
      "Invoice",
      `select Id, SyncToken from Invoice where DocNumber = '${q(String(invoice.invoiceNumber))}' and CustomerRef = '${q(customerId)}'`
    );
    if (matches.length > 0) {
      const existing = matches[0] as { Id: string; SyncToken?: string };
      result = await qboPost(connection, "invoice", {
        ...payload,
        Id: existing.Id,
        SyncToken: existing.SyncToken,
        sparse: true,
      });
    } else {
      result = await qboPost(connection, "invoice", payload);
    }
  }

  const qboInvoice = result.Invoice as { Id: string; SyncToken?: string };
  await saveSyncRecord({
    connection,
    entityType: "INVOICE",
    localId: invoiceId,
    qboId: qboInvoice.Id,
    qboSyncToken: qboInvoice.SyncToken,
    localUpdatedAt: invoice.updatedAt,
  });
  return qboInvoice.Id;
}

// ─── Entity push: Estimate (our Quote) ───────────────────────────────────────

/** Our quote status → QBO Estimate TxnStatus. */
function estimateTxnStatus(status: string): string {
  if (status === "APPROVED" || status === "CONVERTED") return "Accepted";
  if (status === "ARCHIVED") return "Closed";
  return "Pending";
}

/**
 * Push one quote as a QBO Estimate (create or sparse update). Drafts are
 * skipped — QBO only hears about quotes a client actually received. Optional
 * items the client removed are left off, matching what they approved.
 */
export async function pushEstimate(
  connection: QuickBooksConnection,
  quoteId: string
): Promise<string | null> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: connection.companyId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) throw new Error("Quote not found");
  if (quote.status === "DRAFT") return null;

  const record = await getSyncRecord(connection.companyId, "ESTIMATE", quoteId);
  if (
    record?.qboId &&
    record.status === "SYNCED" &&
    record.localUpdatedAt &&
    quote.updatedAt <= record.localUpdatedAt
  ) {
    return record.qboId;
  }

  const customerId = await ensureCustomer(connection, quote.contactId);
  const itemId = await ensureDefaultItem(connection);
  const taxable = money(quote.tax) > 0;

  const lines: QboEntity[] = quote.lineItems
    .filter((li) => !(li.isOptional && li.optedOut))
    .map((li) => ({
      DetailType: "SalesItemLineDetail",
      Amount: money(li.total),
      Description: [li.name, li.description].filter(Boolean).join(" — ").slice(0, 4000) || undefined,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: Number(li.quantity),
        UnitPrice: money(li.unitPrice),
        TaxCodeRef: { value: taxable ? "TAX" : "NON" },
      },
    }));
  if (money(quote.discount) > 0) {
    lines.push({
      DetailType: "DiscountLineDetail",
      Amount: money(quote.discount),
      DiscountLineDetail: { PercentBased: false },
    });
  }

  const payload: QboEntity = {
    CustomerRef: { value: customerId },
    DocNumber: String(quote.quoteNumber),
    TxnDate: dateOnly(quote.sentAt ?? quote.createdAt),
    TxnStatus: estimateTxnStatus(quote.status),
    ...(quote.validUntil ? { ExpirationDate: dateOnly(quote.validUntil) } : {}),
    Line: lines,
    ...(taxable ? { TxnTaxDetail: { TotalTax: money(quote.tax) } } : {}),
    PrivateNote: `Synced from WorkBench (quote #${quote.quoteNumber})`.slice(0, 4000),
  };

  let result: QboEntity;
  if (record?.qboId) {
    const current = await qboGet(connection, `estimate/${record.qboId}`);
    const existing = current.Estimate as QboEntity;
    result = await qboPost(connection, "estimate", {
      ...payload,
      Id: record.qboId,
      SyncToken: existing.SyncToken,
      sparse: true,
    });
  } else {
    // Adopt an existing estimate with our number so a lost sync record (or a
    // pre-Hub estimate) can't double-book.
    const matches = await qboQuery(
      connection,
      "Estimate",
      `select Id, SyncToken from Estimate where DocNumber = '${q(String(quote.quoteNumber))}' and CustomerRef = '${q(customerId)}'`
    );
    if (matches.length > 0) {
      const existing = matches[0] as { Id: string; SyncToken?: string };
      result = await qboPost(connection, "estimate", {
        ...payload,
        Id: existing.Id,
        SyncToken: existing.SyncToken,
        sparse: true,
      });
    } else {
      result = await qboPost(connection, "estimate", payload);
    }
  }

  const qboEstimate = result.Estimate as { Id: string; SyncToken?: string };
  await saveSyncRecord({
    connection,
    entityType: "ESTIMATE",
    localId: quoteId,
    qboId: qboEstimate.Id,
    qboSyncToken: qboEstimate.SyncToken,
    localUpdatedAt: quote.updatedAt,
  });
  return qboEstimate.Id;
}

// ─── Entity push: Purchase (our Expense) ─────────────────────────────────────

/**
 * The bank (or, failing that, credit-card) account money moves through for
 * pushed expenses and refund receipts — prefers one named like "Checking".
 * Resolved once and cached on the connection; bookkeepers can re-point a
 * transaction inside QBO.
 */
async function ensurePaymentAccount(connection: QuickBooksConnection): Promise<string> {
  if (connection.paymentAccountId) return connection.paymentAccountId;

  const banks = await qboQuery(
    connection,
    "Account",
    "select Id, Name from Account where AccountType = 'Bank' maxresults 20"
  );
  const cards =
    banks.length > 0
      ? []
      : await qboQuery(
          connection,
          "Account",
          "select Id, Name from Account where AccountType = 'Credit Card' maxresults 20"
        );
  const pay = banks.find((a) => /check/i.test(String(a.Name))) ?? banks[0] ?? cards[0];
  if (!pay) {
    throw new Error(
      "No bank or credit-card account found in this QuickBooks company — add one in QuickBooks first."
    );
  }
  const paymentAccountId = (pay as unknown as { Id: string }).Id;
  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { paymentAccountId },
  });
  connection.paymentAccountId = paymentAccountId;
  return paymentAccountId;
}

/**
 * Resolve (once) the two accounts an expense Purchase needs: the expense
 * account its line posts to and the bank/credit account it's paid from.
 * Our Expense model has no vendor or payment method, so this is deliberately
 * generic — the point is the numbers land on the P&L, bookkeepers can
 * recategorize inside QBO.
 */
async function ensureExpenseAccounts(
  connection: QuickBooksConnection
): Promise<{ expenseAccountId: string; paymentAccountId: string }> {
  const paymentAccountId = await ensurePaymentAccount(connection);
  if (connection.expenseAccountId) {
    return { expenseAccountId: connection.expenseAccountId, paymentAccountId };
  }

  let expenseAccountId = connection.expenseAccountId;
  if (!expenseAccountId) {
    const named = await qboQuery(
      connection,
      "Account",
      `select Id from Account where Name = '${q(EXPENSE_ACCOUNT_NAME)}'`
    );
    if (named.length > 0) {
      expenseAccountId = (named[0] as { Id: string }).Id;
    } else {
      const expenseAccounts = await qboQuery(
        connection,
        "Account",
        "select Id, Name from Account where AccountType = 'Expense' maxresults 100"
      );
      const preferred = expenseAccounts.find((a) =>
        /miscellaneous|other|supplies|job/i.test(String(a.Name))
      );
      if (preferred) {
        expenseAccountId = (preferred as unknown as { Id: string }).Id;
      } else {
        const created = await qboPost(connection, "account", {
          Name: EXPENSE_ACCOUNT_NAME,
          AccountType: "Expense",
        });
        expenseAccountId = (created.Account as { Id: string }).Id;
      }
    }
  }

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { expenseAccountId },
  });
  connection.expenseAccountId = expenseAccountId;
  return { expenseAccountId, paymentAccountId };
}

/**
 * Push one expense as a QBO Purchase (create or full update — Purchase has
 * no meaningful sparse semantics for our single-line shape).
 */
export async function pushExpense(
  connection: QuickBooksConnection,
  expenseId: string
): Promise<string | null> {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, companyId: connection.companyId },
  });
  if (!expense) throw new Error("Expense not found");

  const record = await getSyncRecord(connection.companyId, "PURCHASE", expenseId);
  if (
    record?.qboId &&
    record.status === "SYNCED" &&
    record.localUpdatedAt &&
    expense.updatedAt <= record.localUpdatedAt
  ) {
    return record.qboId;
  }

  const { expenseAccountId, paymentAccountId } = await ensureExpenseAccounts(connection);

  const payload: QboEntity = {
    PaymentType: "Cash", // generic — our Expense has no payment method
    AccountRef: { value: paymentAccountId },
    TxnDate: dateOnly(expense.incurredAt),
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: money(expense.amount),
        Description: [expense.category, expense.description]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 4000),
        AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
      },
    ],
    PrivateNote: "Synced from WorkBench (expense)".slice(0, 4000),
  };

  let result: QboEntity;
  if (record?.qboId) {
    const current = await qboGet(connection, `purchase/${record.qboId}`);
    const existing = current.Purchase as QboEntity;
    result = await qboPost(connection, "purchase", {
      ...payload,
      Id: record.qboId,
      SyncToken: existing.SyncToken,
    });
  } else {
    result = await qboPost(connection, "purchase", payload);
  }

  const qboPurchase = result.Purchase as { Id: string; SyncToken?: string };
  await saveSyncRecord({
    connection,
    entityType: "PURCHASE",
    localId: expenseId,
    qboId: qboPurchase.Id,
    qboSyncToken: qboPurchase.SyncToken,
    localUpdatedAt: expense.updatedAt,
  });
  return qboPurchase.Id;
}

// ─── Entity push: Payment ────────────────────────────────────────────────────

/**
 * Push one payment, applied against its (already synced) invoice.
 *
 * QuickBooks gets what the client actually paid. A refund here decrements
 * `Payment.amount` (every balance reads it), so the refunds are added back:
 * the QBO payment is the deposit the bank saw, and each refund is its own
 * RefundReceipt (pushRefund) the bank also saw. Shrinking the payment instead
 * — what this did before — left the bookkeeper a deposit that matched
 * nothing and an outflow QuickBooks had never heard of.
 *
 * Payments have no updatedAt, so a synced record short-circuits — the sweep
 * has no way to notice a change on its own. The refund path calls in here
 * with force:true to re-assert the amount (which also repairs a payment the
 * old behaviour shrank; see queueQuickBooksPaymentRefresh).
 */
export async function pushPayment(
  connection: QuickBooksConnection,
  paymentId: string,
  opts: { force?: boolean } = {}
): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, companyId: connection.companyId },
    include: {
      invoice: { select: { id: true, contactId: true, invoiceNumber: true, status: true } },
      refunds: { select: { amount: true } },
    },
  });
  if (!payment) throw new Error("Payment not found");

  const record = await getSyncRecord(connection.companyId, "PAYMENT", paymentId);
  if (record?.qboId && record.status === "SYNCED" && !opts.force) return record.qboId;

  const refunded = money(payment.refunds.reduce((s, r) => s + Number(r.amount), 0));
  const paidAmount = money(Number(payment.amount) + refunded);
  // Nothing was ever kept (a bank transfer the bank sent back) — QBO rejects
  // a zero payment, and the unwind path is what removes one already there.
  if (paidAmount <= 0) return null;

  // Updating an existing QBO payment needs its current SyncToken; ours goes
  // stale the moment anyone edits it in QuickBooks, so read it back first. If
  // QBO no longer has the payment, fall through and create it again.
  let existing: { Id: string; SyncToken: string } | null = null;
  if (record?.qboId) {
    const remote = await fetchQboEntity(connection, "payment", record.qboId);
    if (remote) {
      existing = { Id: record.qboId, SyncToken: String(remote.SyncToken ?? record.qboSyncToken ?? "0") };
    }
  }

  const qboInvoiceId = await pushInvoice(connection, payment.invoice.id);
  if (!qboInvoiceId || !payment.invoice.contactId) return null;
  const customerId = await ensureCustomer(connection, payment.invoice.contactId);

  const memoBits = [
    `WorkBench payment — ${payment.method.toLowerCase().replace(/_/g, " ")}`,
    payment.details ?? "",
    money(payment.surchargeAmount) > 0
      ? `includes $${money(payment.surchargeAmount).toFixed(2)} card surcharge`
      : "",
    refunded > 0 ? `$${refunded.toFixed(2)} since refunded — see the refund receipt` : "",
  ].filter(Boolean);

  const result = await qboPost(connection, "payment", {
    ...(existing ?? {}),
    CustomerRef: { value: customerId },
    TotalAmt: paidAmount,
    TxnDate: dateOnly(payment.paidAt),
    ...(payment.referenceNumber ? { PaymentRefNum: payment.referenceNumber.slice(0, 21) } : {}),
    PrivateNote: memoBits.join(" · ").slice(0, 4000),
    Line: [
      {
        Amount: paidAmount,
        LinkedTxn: [{ TxnId: qboInvoiceId, TxnType: "Invoice" }],
      },
    ],
  });

  const qboPayment = result.Payment as { Id: string; SyncToken?: string };
  await saveSyncRecord({
    connection,
    entityType: "PAYMENT",
    localId: paymentId,
    qboId: qboPayment.Id,
    qboSyncToken: qboPayment.SyncToken,
    localUpdatedAt: payment.createdAt,
  });
  return qboPayment.Id;
}

// ─── Entity push: RefundReceipt (our Refund) ─────────────────────────────────

/**
 * How a refund splits across the two things it gave back: the card
 * surcharge (its own item, so fee income comes down with it) and the
 * services the rest of it paid for. `amount` already includes the surcharge
 * portion, the way Payment.amount does.
 */
export function refundReceiptSplit(
  amount: Prisma.Decimal | number,
  surchargeAmount: Prisma.Decimal | number | null | undefined
): { services: number; surcharge: number } {
  const total = money(amount);
  const surcharge = Math.min(Math.max(money(surchargeAmount), 0), Math.max(total, 0));
  return { services: money(total - surcharge), surcharge };
}

/**
 * Push one refund as a QBO RefundReceipt: the money going back out, from
 * the same bank account expenses are paid from, against the items the
 * invoice billed. The QBO payment stays at the full amount (pushPayment),
 * so the bookkeeper matches the deposit AND the refund to their bank feed
 * and income comes down by exactly what was returned.
 *
 * Refund rows never change, so a synced record is final; a row that
 * disappears (the processor rejected the refund after it was recorded) is
 * caught by unwindOrphanRefunds. Tax is not refunded line-by-line — the
 * receipt is NON-taxable, the way the surcharge and deposit lines are.
 */
export async function pushRefund(
  connection: QuickBooksConnection,
  refundId: string
): Promise<string | null> {
  const refund = await prisma.refund.findFirst({
    where: { id: refundId, companyId: connection.companyId },
    include: {
      payment: {
        select: {
          method: true,
          invoice: { select: { id: true, contactId: true, invoiceNumber: true } },
        },
      },
    },
  });
  if (!refund) throw new Error("Refund not found");

  const record = await getSyncRecord(connection.companyId, "REFUND", refundId);
  if (record?.qboId && record.status === "SYNCED") return record.qboId;

  const invoice = refund.payment.invoice;
  if (!invoice.contactId) return null;
  const split = refundReceiptSplit(refund.amount, refund.surchargeAmount);
  if (split.services <= 0 && split.surcharge <= 0) return null;

  const customerId = await ensureCustomer(connection, invoice.contactId);
  const lines: QboEntity[] = [];
  if (split.services > 0) {
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: split.services,
      Description: `Refund — invoice #${invoice.invoiceNumber}`,
      SalesItemLineDetail: {
        ItemRef: { value: await ensureDefaultItem(connection) },
        TaxCodeRef: { value: "NON" },
      },
    });
  }
  if (split.surcharge > 0) {
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: split.surcharge,
      Description: "Refunded card processing surcharge",
      SalesItemLineDetail: {
        ItemRef: { value: await ensureSurchargeItem(connection) },
        TaxCodeRef: { value: "NON" },
      },
    });
  }
  const depositAccountId = await ensurePaymentAccount(connection);

  const method = refund.payment.method.toLowerCase().replace(/_/g, " ");
  const result = await qboPost(connection, "refundreceipt", {
    CustomerRef: { value: customerId },
    DepositToAccountRef: { value: depositAccountId },
    TxnDate: dateOnly(refund.createdAt),
    ...(refund.reversalRef ? { PaymentRefNum: refund.reversalRef.slice(0, 21) } : {}),
    PrivateNote: `WorkBench refund of a ${method} payment on invoice #${invoice.invoiceNumber}${
      refund.reversalRef ? ` (${refund.reversalRef})` : ""
    }`.slice(0, 4000),
    Line: lines,
  });

  const receipt = result.RefundReceipt as { Id: string; SyncToken?: string };
  await saveSyncRecord({
    connection,
    entityType: "REFUND",
    localId: refundId,
    qboId: receipt.Id,
    qboSyncToken: receipt.SyncToken,
    localUpdatedAt: refund.createdAt,
  });
  return receipt.Id;
}

// ─── Unwind: money that stopped existing here has to stop existing there ─────

/**
 * Remove the QBO counterpart of a local row that was deleted or reversed.
 *
 * The sync is push-only, which was fine while records only ever appeared —
 * but a refunded, bounced or deleted payment used to just stay in QuickBooks
 * forever. The books then disagree silently: QBO says the invoice was paid,
 * WorkBench says it's open, and nobody finds out until a reconciliation.
 *
 * We delete rather than void, mirroring what the user did here — they removed
 * the record in WorkBench, so leaving a zeroed ghost in QuickBooks they never
 * asked for would be its own kind of surprise. A refund that only reduces a
 * payment is NOT a delete; that goes through pushPayment's update path.
 *
 * Idempotent: no sync record, no qboId, or an entity QBO no longer has all
 * count as done. Returns what happened, for logging.
 */
export async function unwindQboEntity(
  connection: QuickBooksConnection,
  entityType: QuickBooksEntityType,
  localId: string
): Promise<"deleted" | "already-gone" | "not-synced"> {
  const record = await getSyncRecord(connection.companyId, entityType, localId);
  if (!record?.qboId) {
    // Never made it to QuickBooks; drop any error record so it isn't retried.
    if (record) await prisma.quickBooksSyncRecord.delete({ where: { id: record.id } }).catch(() => {});
    return "not-synced";
  }

  const path = QBO_ENTITY_PATH[entityType];
  const remote = await fetchQboEntity(connection, path, record.qboId);
  if (!remote) {
    await prisma.quickBooksSyncRecord.delete({ where: { id: record.id } }).catch(() => {});
    return "already-gone";
  }

  await qboDelete(connection, path, record.qboId, String(remote.SyncToken ?? record.qboSyncToken ?? "0"));
  await prisma.quickBooksSyncRecord.delete({ where: { id: record.id } }).catch(() => {});
  return "deleted";
}

/**
 * Refund receipts whose Refund row is gone: the processor rejected the
 * refund after it was recorded (the webhook restores the payment and drops
 * the row), or the payment itself was deleted and its refunds cascaded. The
 * missing row can't tell anyone, so the two sides are compared. Returns how
 * many receipts came off.
 */
export async function unwindOrphanRefunds(connection: QuickBooksConnection): Promise<number> {
  const records = await prisma.quickBooksSyncRecord.findMany({
    where: { companyId: connection.companyId, entityType: "REFUND" },
    select: { localId: true },
  });
  if (records.length === 0) return 0;
  const alive = new Set(
    (
      await prisma.refund.findMany({
        where: { id: { in: records.map((r) => r.localId) } },
        select: { id: true },
      })
    ).map((r) => r.id)
  );
  let removed = 0;
  for (const r of records) {
    if (alive.has(r.localId)) continue;
    if ((await unwindQboEntity(connection, "REFUND", r.localId)) === "deleted") removed++;
  }
  return removed;
}

/**
 * Fire-and-forget unwind, for the request paths that delete money records.
 * Never throws and never blocks the delete itself — a failure lands in the
 * log and the record stays in QuickBooks until someone reconciles, which is
 * strictly better than failing the user's delete.
 */
export function queueQuickBooksUnwind(params: {
  companyId: string;
  entityType: QuickBooksEntityType;
  localId: string;
}): void {
  void (async () => {
    try {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { companyId: params.companyId },
      });
      if (!connection || !connection.autoSync) return;
      const outcome = await unwindQboEntity(connection, params.entityType, params.localId);
      if (outcome === "deleted") {
        console.log(`[quickbooks] removed ${params.entityType} ${params.localId} from QuickBooks`);
      }
      // A deleted payment takes its refunds with it (cascade) — their receipts too.
      if (params.entityType === "PAYMENT") await unwindOrphanRefunds(connection);
    } catch (err) {
      reportError("[quickbooks] unwind failed", params, err);
    }
  })();
}

/**
 * Unwind a deleted invoice and the payments that went with it.
 *
 * Order matters and concurrency would break it: QuickBooks refuses to delete
 * an invoice while a payment is still applied to it, so the payments have to
 * come off first. One queued task doing them in sequence, rather than N
 * independent ones racing.
 */
export function queueQuickBooksInvoiceUnwind(params: {
  companyId: string;
  invoiceId: string;
  paymentIds: string[];
}): void {
  void (async () => {
    try {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { companyId: params.companyId },
      });
      if (!connection || !connection.autoSync) return;
      for (const paymentId of params.paymentIds) {
        await unwindQboEntity(connection, "PAYMENT", paymentId);
      }
      await unwindQboEntity(connection, "INVOICE", params.invoiceId);
      await unwindOrphanRefunds(connection);
    } catch (err) {
      reportError("[quickbooks] invoice unwind failed", params, err);
    }
  })();
}

/**
 * The refunds on a payment changed — one was recorded, or one the processor
 * rejected came back off — so make QuickBooks agree. The QBO payment is
 * re-asserted at what the client actually paid (which also repairs one an
 * earlier version shrank), every surviving Refund row gets its receipt, and
 * the receipt of any row that is gone comes off. Payments carry no
 * updatedAt, so the sweep can't see this on its own; the refund route and
 * the processor webhooks call it directly.
 */
export function queueQuickBooksPaymentRefresh(params: {
  companyId: string;
  paymentId: string;
}): void {
  void (async () => {
    try {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { companyId: params.companyId },
      });
      if (!connection || !connection.autoSync) return;

      const payment = await prisma.payment.findFirst({
        where: { id: params.paymentId, companyId: params.companyId },
        select: { amount: true, refunds: { select: { id: true, amount: true } } },
      });
      if (!payment) return;

      const paid = money(Number(payment.amount) + payment.refunds.reduce((s, r) => s + Number(r.amount), 0));
      if (paid <= 0) {
        await unwindQboEntity(connection, "PAYMENT", params.paymentId);
      } else {
        await pushPayment(connection, params.paymentId, { force: true });
        for (const refund of payment.refunds) {
          try {
            await pushRefund(connection, refund.id);
          } catch (err) {
            await saveSyncError(connection, "REFUND", refund.id, err);
            reportError("[quickbooks] refund receipt failed", { refundId: refund.id }, err);
          }
        }
      }
      await unwindOrphanRefunds(connection);
    } catch (err) {
      reportError("[quickbooks] payment refresh failed", params, err);
    }
  })();
}

// ─── Full-company sync sweep ─────────────────────────────────────────────────

export interface SyncSummary {
  invoices: { pushed: number; failed: number; skipped: number };
  payments: { pushed: number; failed: number };
  refunds: { pushed: number; failed: number };
  quotes: { pushed: number; failed: number; skipped: number };
  expenses: { pushed: number; failed: number };
  done: boolean; // false = batch cap hit, another run will continue
}

/**
 * Push everything that's new or changed: non-draft invoices missing a sync
 * record or edited since their last push (customers ride along), then
 * payments missing a record. Per-entity failures land on the sync record
 * and the sweep keeps going; connection-level failures (dead refresh token)
 * abort and land on `lastSyncError`.
 */
export async function syncCompany(companyId: string): Promise<SyncSummary> {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
  if (!connection) throw new Error("QuickBooks is not connected");

  const summary: SyncSummary = {
    invoices: { pushed: 0, failed: 0, skipped: 0 },
    payments: { pushed: 0, failed: 0 },
    refunds: { pushed: 0, failed: 0 },
    quotes: { pushed: 0, failed: 0, skipped: 0 },
    expenses: { pushed: 0, failed: 0 },
    done: true,
  };

  try {
    // Candidate invoices: every non-draft invoice, filtered against sync
    // records in memory (the set of records is at most the set of invoices).
    // An archived invoice QuickBooks never heard of stays that way (plan
    // billing and gift cards archive plenty) — only one it knows needs the
    // void or the reopen.
    const [invoices, invoiceRecords] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId, status: { not: "DRAFT" } },
        select: { id: true, updatedAt: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quickBooksSyncRecord.findMany({
        where: { companyId, entityType: "INVOICE" },
      }),
    ]);
    const recordByInvoice = new Map(invoiceRecords.map((r) => [r.localId, r]));
    const dueInvoices = invoices.filter((inv) => {
      const r = recordByInvoice.get(inv.id);
      if (inv.status === "ARCHIVED" && !r?.qboId) return false;
      return !(
        r?.qboId &&
        r.status === "SYNCED" &&
        r.localUpdatedAt &&
        inv.updatedAt <= r.localUpdatedAt
      );
    });

    let budget = SYNC_BATCH_LIMIT;
    for (const inv of dueInvoices) {
      if (budget-- <= 0) {
        summary.done = false;
        break;
      }
      try {
        const id = await pushInvoice(connection, inv.id);
        if (id) summary.invoices.pushed++;
        else summary.invoices.skipped++;
      } catch (err) {
        if (isConnectionLevelError(err)) throw err;
        summary.invoices.failed++;
        await saveSyncError(connection, "INVOICE", inv.id, err);
      }
    }

    const [payments, paymentRecords] = await Promise.all([
      prisma.payment.findMany({
        where: { companyId },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quickBooksSyncRecord.findMany({
        where: { companyId, entityType: "PAYMENT", status: "SYNCED" },
        select: { localId: true },
      }),
    ]);
    const syncedPayments = new Set(paymentRecords.map((r) => r.localId));
    for (const p of payments) {
      if (syncedPayments.has(p.id)) continue;
      if (budget-- <= 0) {
        summary.done = false;
        break;
      }
      try {
        const id = await pushPayment(connection, p.id);
        if (id) summary.payments.pushed++;
      } catch (err) {
        if (isConnectionLevelError(err)) throw err;
        summary.payments.failed++;
        await saveSyncError(connection, "PAYMENT", p.id, err);
      }
    }

    // Refunds → Refund receipts. Rows never change, so anything without a
    // synced record is due; then receipts whose row is gone come off.
    const [refunds, refundRecords] = await Promise.all([
      prisma.refund.findMany({
        where: { companyId },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quickBooksSyncRecord.findMany({
        where: { companyId, entityType: "REFUND", status: "SYNCED" },
        select: { localId: true },
      }),
    ]);
    const syncedRefunds = new Set(refundRecords.map((r) => r.localId));
    for (const r of refunds) {
      if (syncedRefunds.has(r.id)) continue;
      if (budget-- <= 0) {
        summary.done = false;
        break;
      }
      try {
        const id = await pushRefund(connection, r.id);
        if (id) summary.refunds.pushed++;
      } catch (err) {
        if (isConnectionLevelError(err)) throw err;
        summary.refunds.failed++;
        await saveSyncError(connection, "REFUND", r.id, err);
      }
    }
    try {
      await unwindOrphanRefunds(connection);
    } catch (err) {
      if (isConnectionLevelError(err)) throw err;
      reportError("[quickbooks] orphan refund sweep failed", { companyId }, err);
    }

    // Quotes → Estimates (same never-synced-or-edited-since filter as invoices)
    const [quotes, quoteRecords] = await Promise.all([
      prisma.quote.findMany({
        where: { companyId, status: { not: "DRAFT" } },
        select: { id: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quickBooksSyncRecord.findMany({
        where: { companyId, entityType: "ESTIMATE" },
      }),
    ]);
    const recordByQuote = new Map(quoteRecords.map((r) => [r.localId, r]));
    const dueQuotes = quotes.filter((qt) => {
      const r = recordByQuote.get(qt.id);
      return !(
        r?.qboId &&
        r.status === "SYNCED" &&
        r.localUpdatedAt &&
        qt.updatedAt <= r.localUpdatedAt
      );
    });
    for (const qt of dueQuotes) {
      if (budget-- <= 0) {
        summary.done = false;
        break;
      }
      try {
        const id = await pushEstimate(connection, qt.id);
        if (id) summary.quotes.pushed++;
        else summary.quotes.skipped++;
      } catch (err) {
        if (isConnectionLevelError(err)) throw err;
        summary.quotes.failed++;
        await saveSyncError(connection, "ESTIMATE", qt.id, err);
      }
    }

    // Expenses → Purchases
    const [expenses, expenseRecords] = await Promise.all([
      prisma.expense.findMany({
        where: { companyId },
        select: { id: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quickBooksSyncRecord.findMany({
        where: { companyId, entityType: "PURCHASE" },
      }),
    ]);
    const recordByExpense = new Map(expenseRecords.map((r) => [r.localId, r]));
    const dueExpenses = expenses.filter((ex) => {
      const r = recordByExpense.get(ex.id);
      return !(
        r?.qboId &&
        r.status === "SYNCED" &&
        r.localUpdatedAt &&
        ex.updatedAt <= r.localUpdatedAt
      );
    });
    for (const ex of dueExpenses) {
      if (budget-- <= 0) {
        summary.done = false;
        break;
      }
      try {
        const id = await pushExpense(connection, ex.id);
        if (id) summary.expenses.pushed++;
      } catch (err) {
        if (isConnectionLevelError(err)) throw err;
        summary.expenses.failed++;
        await saveSyncError(connection, "PURCHASE", ex.id, err);
      }
    }

    await prisma.quickBooksConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 800);
    await prisma.quickBooksConnection.update({
      where: { id: connection.id },
      data: { lastSyncError: message },
    });
    throw err;
  }

  return summary;
}

/** Auth failures poison the whole sweep; entity validation errors don't. */
function isConnectionLevelError(err: unknown): boolean {
  if (err instanceof QboApiError) return err.status === 401 || err.status === 403;
  return err instanceof Error && /reconnect from Settings/i.test(err.message);
}

// ─── Hooks: event-driven + nightly ───────────────────────────────────────────

/**
 * Fire-and-forget push of an invoice + its new payment, called right after
 * `recordPayment()`. Never throws, never blocks the caller; failures land on
 * sync records for the settings page (and the nightly sweep retries them).
 */
export function queueQuickBooksPaymentSync(params: {
  companyId: string;
  invoiceId: string;
  paymentId: string;
}): void {
  void (async () => {
    try {
      const connection = await prisma.quickBooksConnection.findUnique({
        where: { companyId: params.companyId },
      });
      if (!connection || !connection.autoSync) return;
      await pushInvoice(connection, params.invoiceId);
      await pushPayment(connection, params.paymentId);
    } catch (err) {
      reportError("[quickbooks] background payment sync failed", err);
    }
  })();
}

/**
 * Fire-and-forget push of one invoice the moment it changes hands — marked
 * sent, edited, archived, reopened, opened by the client — so QuickBooks
 * shows it in seconds instead of at the next sweep. A failure lands on the
 * invoice's sync record (the settings page lists it) and the sweep retries.
 */
export function queueQuickBooksInvoiceSync(params: { companyId: string; invoiceId: string }): void {
  void (async () => {
    let connection: QuickBooksConnection | null = null;
    try {
      connection = await prisma.quickBooksConnection.findUnique({
        where: { companyId: params.companyId },
      });
      if (!connection || !connection.autoSync) return;
      await pushInvoice(connection, params.invoiceId);
    } catch (err) {
      if (connection && !isConnectionLevelError(err)) {
        await saveSyncError(connection, "INVOICE", params.invoiceId, err).catch(() => {});
      }
      reportError("[quickbooks] background invoice sync failed", params, err);
    }
  })();
}

/** Nightly cron sweep: full sync for every auto-sync connection. */
export async function runQuickBooksNightlySync(): Promise<{
  companies: number;
  pushed: number;
  failed: number;
}> {
  if (!isQuickBooksConfigured()) return { companies: 0, pushed: 0, failed: 0 };
  const connections = await prisma.quickBooksConnection.findMany({
    where: { autoSync: true },
    select: { companyId: true },
  });
  let pushed = 0;
  let failed = 0;
  for (const { companyId } of connections) {
    try {
      const s = await syncCompany(companyId);
      pushed += s.invoices.pushed + s.payments.pushed + s.refunds.pushed + s.quotes.pushed + s.expenses.pushed;
      failed += s.invoices.failed + s.payments.failed + s.refunds.failed + s.quotes.failed + s.expenses.failed;
    } catch (err) {
      failed++;
      reportError(`[quickbooks] nightly sync failed for company ${companyId}`, err);
    }
  }
  return { companies: connections.length, pushed, failed };
}
