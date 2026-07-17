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
 *  - All invoice lines bill against one generic "Streamflaire Services"
 *    item (Jobber's default behavior) — per-WorkItem item sync is Phase 2.
 *  - Tax is pushed as an invoice-level total (all lines marked TAX when the
 *    invoice has tax); QBO Automated Sales Tax may recalculate it.
 *  - Card surcharges live on the Payment row here, not the invoice, so they
 *    are noted in the QBO payment memo rather than booked as income.
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
const DEFAULT_ITEM_NAME = "Streamflaire Services";
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

// state = companyId.expiresAtMs.hmac — self-contained, 10-minute lifetime.
// The callback ALSO requires a signed-in manager of the same company; the
// HMAC just prevents a forged callback from binding tokens to someone
// else's account.
function stateSignature(companyId: string, expiresAt: number): string {
  return createHmac("sha256", encryptionKey())
    .update(`${companyId}.${expiresAt}`)
    .digest("hex");
}

export function buildAuthorizeUrl(companyId: string): string {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const state = `${companyId}.${expiresAt}.${stateSignature(companyId, expiresAt)}`;
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID ?? "",
    response_type: "code",
    scope: OAUTH_SCOPE,
    redirect_uri: redirectUri(),
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export function verifyState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [companyId, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!companyId || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return sig === stateSignature(companyId, expiresAt) ? companyId : null;
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
    console.error("[quickbooks] companyinfo fetch failed", err);
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
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token: decryptToken(connection.refreshTokenEnc) }),
    });
  } catch (err) {
    console.error("[quickbooks] token revoke failed (connection still deleted)", err);
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
    throw new Error(
      `QuickBooks session expired — reconnect from Settings → QuickBooks. (${err instanceof Error ? err.message : err})`
    );
  }
  const data = tokenDataFromResponse(tokens);
  Object.assign(connection, data);
  await prisma.quickBooksConnection.update({ where: { id: connection.id }, data });
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
}) {
  const data = {
    qboId: params.qboId,
    qboSyncToken: params.qboSyncToken ?? null,
    status: "SYNCED" as const,
    error: null,
    localUpdatedAt: params.localUpdatedAt ?? null,
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

// ─── Entity push: Invoice ────────────────────────────────────────────────────

/**
 * Push one invoice (create or sparse update). Drafts are skipped — QBO only
 * hears about invoices once they're real. Returns the QBO invoice id, or
 * null when the invoice isn't syncable yet (draft / no client).
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
    lines.push({
      DetailType: "SalesItemLineDetail",
      Amount: money(invoice.surcharge),
      Description: "Card processing surcharge",
      SalesItemLineDetail: { ItemRef: { value: itemId }, TaxCodeRef: { value: "NON" } },
    });
  }

  const payload: QboEntity = {
    CustomerRef: { value: customerId },
    DocNumber: String(invoice.invoiceNumber),
    TxnDate: dateOnly(invoice.issuedAt ?? invoice.createdAt),
    ...(invoice.dueDate ? { DueDate: dateOnly(invoice.dueDate) } : {}),
    Line: lines,
    ...(taxable ? { TxnTaxDetail: { TotalTax: money(invoice.tax) } } : {}),
    PrivateNote: `Synced from Streamflaire Hub (invoice #${invoice.invoiceNumber})`.slice(0, 4000),
  };

  let result: QboEntity;
  if (record?.qboId) {
    const current = await qboGet(connection, `invoice/${record.qboId}`);
    const existing = current.Invoice as QboEntity;
    result = await qboPost(connection, "invoice", {
      ...payload,
      Id: record.qboId,
      SyncToken: existing.SyncToken,
      sparse: true,
    });
  } else {
    result = await qboPost(connection, "invoice", payload);
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

// ─── Entity push: Payment ────────────────────────────────────────────────────

/**
 * Push one payment, applied against its (already synced) invoice. Payments
 * are immutable here, so an existing SYNCED record short-circuits.
 */
export async function pushPayment(
  connection: QuickBooksConnection,
  paymentId: string
): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, companyId: connection.companyId },
    include: { invoice: { select: { id: true, contactId: true, invoiceNumber: true, status: true } } },
  });
  if (!payment) throw new Error("Payment not found");

  const record = await getSyncRecord(connection.companyId, "PAYMENT", paymentId);
  if (record?.qboId && record.status === "SYNCED") return record.qboId;

  const qboInvoiceId = await pushInvoice(connection, payment.invoice.id);
  if (!qboInvoiceId || !payment.invoice.contactId) return null;
  const customerId = await ensureCustomer(connection, payment.invoice.contactId);

  const memoBits = [
    `Streamflaire Hub payment — ${payment.method.toLowerCase().replace(/_/g, " ")}`,
    payment.details ?? "",
    money(payment.surchargeAmount) > 0
      ? `includes $${money(payment.surchargeAmount).toFixed(2)} card surcharge`
      : "",
  ].filter(Boolean);

  const result = await qboPost(connection, "payment", {
    CustomerRef: { value: customerId },
    TotalAmt: money(payment.amount),
    TxnDate: dateOnly(payment.paidAt),
    ...(payment.referenceNumber ? { PaymentRefNum: payment.referenceNumber.slice(0, 21) } : {}),
    PrivateNote: memoBits.join(" · ").slice(0, 4000),
    Line: [
      {
        Amount: money(payment.amount),
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

// ─── Full-company sync sweep ─────────────────────────────────────────────────

export interface SyncSummary {
  invoices: { pushed: number; failed: number; skipped: number };
  payments: { pushed: number; failed: number };
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
    done: true,
  };

  try {
    // Candidate invoices: every non-draft invoice, filtered against sync
    // records in memory (the set of records is at most the set of invoices).
    const [invoices, invoiceRecords] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId, status: { not: "DRAFT" } },
        select: { id: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.quickBooksSyncRecord.findMany({
        where: { companyId, entityType: "INVOICE" },
      }),
    ]);
    const recordByInvoice = new Map(invoiceRecords.map((r) => [r.localId, r]));
    const dueInvoices = invoices.filter((inv) => {
      const r = recordByInvoice.get(inv.id);
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
      console.error("[quickbooks] background payment sync failed", err);
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
      pushed += s.invoices.pushed + s.payments.pushed;
      failed += s.invoices.failed + s.payments.failed;
    } catch (err) {
      failed++;
      console.error(`[quickbooks] nightly sync failed for company ${companyId}`, err);
    }
  }
  return { companies: connections.length, pushed, failed };
}
