import { reportError } from "@/lib/report-error";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/push";
import { openSecret, sealSecret, signMessage } from "@/lib/secret-box";
import * as square from "@/lib/square";
import { hasInPersonScope } from "@/lib/tap-to-pay-shared";

/**
 * A company's Square grant, end to end: the signed OAuth state, the code
 * exchange that creates the SquareConnection row, the access-token getter
 * every charge goes through (refreshing when due), the 7-day refresh sweep,
 * and disconnect / revocation.
 *
 * Square's rules this follows (developer.squareup.com/docs/oauth-api):
 *  - access tokens live 30 days; refresh every 7 or less; alert when any
 *    stored token is older than 8 days;
 *  - tokens encrypted at rest, the application secret server-side only;
 *  - the seller can disconnect from Settings; a revocation from the Square
 *    side arrives as the `oauth.authorization.revoked` webhook;
 *  - a token's health is probed with ListLocations.
 */

const SECRET_SCOPE = "square-token";
const STATE_TTL_MS = 10 * 60_000;
/** Refresh once the token is this old (Square: 7 days or less). */
export const REFRESH_AFTER_MS = 7 * 86_400_000;
/** Page when a token has gone this long without a successful refresh. */
export const STALE_AFTER_MS = 8 * 86_400_000;

// ─── OAuth state (signed, self-contained; same shape as QuickBooks) ──────────

export type SquareOAuthState = { companyId: string; userId: string };

/** state = companyId.userId.expiresAtMs.hmac — the state IS the identity at
 *  the callback (the native shell opens consent in the system browser, which
 *  has no WorkBench session), so the callback re-checks the user instead. */
export function buildSquareState(companyId: string, userId: string, now = Date.now()): string {
  const expiresAt = now + STATE_TTL_MS;
  const sig = signMessage(`${companyId}.${userId}.${expiresAt}`, SECRET_SCOPE);
  return `${companyId}.${userId}.${expiresAt}.${sig}`;
}

export function verifySquareState(state: string, now = Date.now()): SquareOAuthState | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [companyId, userId, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!companyId || !userId || !Number.isFinite(expiresAt) || expiresAt < now) return null;
  const expected = signMessage(`${companyId}.${userId}.${expiresAt}`, SECRET_SCOPE);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { companyId, userId } : null;
}

export function squareAuthorizeUrlFor(companyId: string, userId: string, opts: { isPlatform?: boolean } = {}): string {
  return square.buildSquareAuthorizeUrl({ state: buildSquareState(companyId, userId), scopes: scopesWantedFor(Boolean(opts.isPlatform)) });
}

// ─── Connect ────────────────────────────────────────────────────────────────

export class SquareConnectError extends Error {
  code: "already_connected_elsewhere" | "no_location" | "exchange_failed" | "merchant_lookup_failed";
  constructor(code: SquareConnectError["code"], message: string) {
    super(message);
    this.name = "SquareConnectError";
    this.code = code;
  }
}

/**
 * Exchange the authorization code, find out who connected and which location
 * takes their card payments, and store it all. Reconnecting the same Square
 * account simply replaces the tokens; a Square account already attached to a
 * DIFFERENT company is refused (squareMerchantId is unique — one seller, one
 * WorkBench company, or two companies would charge into one bank account).
 */
export async function completeSquareConnect(params: { companyId: string; code: string }) {
  let tokens: square.SquareTokenResponse;
  try {
    tokens = await square.obtainSquareToken(params.code);
  } catch (err) {
    reportError("[square] token exchange failed", err);
    throw new SquareConnectError("exchange_failed", "Square didn't accept the authorization code.");
  }
  if (!tokens.refresh_token) {
    throw new SquareConnectError("exchange_failed", "Square returned no refresh token.");
  }

  const other = await prisma.company.findFirst({
    where: { squareMerchantId: tokens.merchant_id, NOT: { id: params.companyId } },
    select: { id: true, name: true },
  });
  if (other) {
    // Don't leave a live token we won't use
    await square.revokeSquareTokens({ accessToken: tokens.access_token }).catch(() => {});
    throw new SquareConnectError(
      "already_connected_elsewhere",
      "That Square account is already connected to another WorkBench company."
    );
  }

  let merchant: square.SquareMerchant | null = null;
  let locations: square.SquareLocation[] = [];
  try {
    [merchant, locations] = await Promise.all([
      square.retrieveSquareMerchant(tokens.access_token),
      square.listSquareLocations(tokens.access_token),
    ]);
  } catch (err) {
    reportError("[square] merchant lookup failed after connect", err);
    throw new SquareConnectError("merchant_lookup_failed", "Connected, but Square's business details couldn't be read.");
  }
  const location = square.pickChargeLocation(locations, merchant?.main_location_id);
  if (!location) {
    await square.revokeSquareTokens({ accessToken: tokens.access_token }).catch(() => {});
    throw new SquareConnectError(
      "no_location",
      "That Square account has no active location that can take card payments."
    );
  }

  const written = await writeConnection({
    companyId: params.companyId,
    merchantId: tokens.merchant_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expires_at),
    merchant,
    location,
  });
  // Somewhere to pay out to? Best effort — never fails the connect.
  await refreshSquarePayoutStatus(params.companyId).catch(() => {});
  return written;
}

/** The one writer of a connection: the SquareConnection row and the
 *  company's handles in a single transaction. `refreshToken: null` stores a
 *  STATIC token (see STATIC_TOKEN below). */
async function writeConnection(params: {
  companyId: string;
  merchantId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  merchant: square.SquareMerchant | null;
  location: square.SquareLocation;
}) {
  const { merchant, location } = params;
  const now = new Date();
  const owner = await prisma.company.findUnique({ where: { id: params.companyId }, select: { isPlatform: true } });
  const row = {
    merchantId: params.merchantId,
    accessTokenEnc: sealSecret(params.accessToken, SECRET_SCOPE),
    refreshTokenEnc: params.refreshToken ? sealSecret(params.refreshToken, SECRET_SCOPE) : STATIC_TOKEN,
    expiresAt: params.expiresAt,
    scopes: scopesWantedFor(Boolean(owner?.isPlatform)).join(" "),
    businessName: merchant?.business_name ?? location.business_name ?? null,
    locationName: location.name ?? null,
    currency: location.currency ?? merchant?.currency ?? "USD",
    country: location.country ?? merchant?.country ?? null,
    refreshedAt: now,
    lastRefreshError: null,
    lastRefreshErrorAt: null,
  };
  await prisma.$transaction([
    prisma.squareConnection.upsert({
      where: { companyId: params.companyId },
      create: { companyId: params.companyId, ...row },
      update: row,
    }),
    prisma.company.update({
      where: { id: params.companyId },
      data: {
        squareMerchantId: params.merchantId,
        squareLocationId: location.id,
        squareConnectedAt: now,
      },
    }),
  ]);

  return {
    merchantId: params.merchantId,
    locationId: location.id,
    businessName: merchant?.business_name ?? location.business_name ?? null,
    locationName: location.name ?? null,
  };
}

/**
 * `refreshTokenEnc` value of a connection whose access token never expires
 * and cannot be refreshed: a Square Developer Console sandbox access token.
 * The refresh paths (lazy getter, hourly sweep, stale page) leave these alone.
 */
export const STATIC_TOKEN = "";

/** Does this connection hold a static (console) token? */
export function isStaticSquareToken(refreshTokenEnc: string): boolean {
  return refreshTokenEnc === STATIC_TOKEN;
}

/**
 * Connect a company to a SANDBOX test seller without the OAuth screen, from
 * the test account's access token in the Developer Console — the e2e harness
 * (e2e/provision.mts) seeds its tenant this way, since Square's sandbox
 * consent page needs the seller's dashboard open in the same browser.
 * Refuses outside the sandbox: a static token must never reach production.
 */
export async function seedSquareStaticConnection(params: { companyId: string; accessToken: string }) {
  if (square.squareEnvironment() !== "sandbox") {
    throw new Error("seedSquareStaticConnection is sandbox-only (SQUARE_ENVIRONMENT=sandbox)");
  }
  const [merchant, locations] = await Promise.all([
    square.retrieveSquareMerchant(params.accessToken),
    square.listSquareLocations(params.accessToken),
  ]);
  const location = square.pickChargeLocation(locations, merchant.main_location_id);
  if (!location) throw new Error("The test seller has no active location that can take card payments.");
  const other = await prisma.company.findFirst({
    where: { squareMerchantId: merchant.id, NOT: { id: params.companyId } },
    select: { id: true },
  });
  if (other) throw new Error(`Square merchant ${merchant.id} is already connected to company ${other.id}`);
  return writeConnection({
    companyId: params.companyId,
    merchantId: merchant.id,
    accessToken: params.accessToken,
    refreshToken: null,
    // Console tokens don't expire; keep the expiry branch of needsRefresh quiet.
    expiresAt: new Date(Date.now() + 10 * 365 * 86_400_000),
    merchant,
    location,
  });
}

// ─── Access tokens ──────────────────────────────────────────────────────────

type ConnectionRow = {
  id: string;
  companyId: string;
  merchantId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
  refreshedAt: Date;
};

const CONNECTION_SELECT = {
  id: true,
  companyId: true,
  merchantId: true,
  accessTokenEnc: true,
  refreshTokenEnc: true,
  expiresAt: true,
  refreshedAt: true,
} as const;

export class SquareNotConnectedError extends Error {
  constructor(message = "This business hasn't connected Square yet.") {
    super(message);
    this.name = "SquareNotConnectedError";
  }
}

/** Refresh in place. Returns the new plaintext access token. A dead grant
 *  (Square says revoked/unauthorized) tears the connection down so every
 *  gate flips to "not connected" instead of failing charge after charge. */
async function refreshConnection(conn: ConnectionRow): Promise<string> {
  let tokens: square.SquareTokenResponse;
  try {
    tokens = await square.refreshSquareToken(openSecret(conn.refreshTokenEnc, SECRET_SCOPE));
  } catch (err) {
    const dead =
      err instanceof square.SquareError &&
      (err.authDead || err.status === 400 || err.code === "invalid_grant");
    await prisma.squareConnection
      .update({
        where: { id: conn.id },
        data: {
          lastRefreshError: err instanceof Error ? err.message.slice(0, 500) : "refresh failed",
          lastRefreshErrorAt: new Date(),
        },
      })
      .catch(() => {});
    if (dead) {
      reportError("[square] refresh token rejected — connection torn down", err, { companyId: conn.companyId });
      await markSquareRevoked(conn.merchantId, "refresh_rejected");
      throw new SquareNotConnectedError("The Square connection has expired — reconnect it in Settings.");
    }
    throw err;
  }
  const now = new Date();
  await prisma.squareConnection.update({
    where: { id: conn.id },
    data: {
      accessTokenEnc: sealSecret(tokens.access_token, SECRET_SCOPE),
      ...(tokens.refresh_token ? { refreshTokenEnc: sealSecret(tokens.refresh_token, SECRET_SCOPE) } : {}),
      expiresAt: new Date(tokens.expires_at),
      refreshedAt: now,
      lastRefreshError: null,
      lastRefreshErrorAt: null,
    },
  });
  return tokens.access_token;
}

export function needsRefresh(conn: Pick<ConnectionRow, "refreshTokenEnc" | "refreshedAt" | "expiresAt">, now = Date.now()): boolean {
  // A static (console) token has nothing to refresh with and never expires.
  if (isStaticSquareToken(conn.refreshTokenEnc)) return false;
  // Due by age (Square's 7-day guidance) or by proximity to expiry (a token
  // the sweep missed must not be used in its last hours).
  return now - conn.refreshedAt.getTime() > REFRESH_AFTER_MS || conn.expiresAt.getTime() - now < 2 * 86_400_000;
}

async function tokenFor(conn: ConnectionRow | null): Promise<{ token: string; conn: ConnectionRow }> {
  if (!conn) throw new SquareNotConnectedError();
  if (needsRefresh(conn)) {
    try {
      return { token: await refreshConnection(conn), conn };
    } catch (err) {
      if (err instanceof SquareNotConnectedError) throw err;
      // Refresh hiccup but the current token is still valid — use it; the
      // sweep will retry the refresh next hour.
      if (conn.expiresAt.getTime() > Date.now() + 60_000) {
        return { token: openSecret(conn.accessTokenEnc, SECRET_SCOPE), conn };
      }
      throw err;
    }
  }
  return { token: openSecret(conn.accessTokenEnc, SECRET_SCOPE), conn };
}

/** The seller's access token by company. Throws SquareNotConnectedError. */
export async function squareTokenForCompany(companyId: string) {
  const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: CONNECTION_SELECT });
  return tokenFor(conn);
}

/** The seller's access token by Square merchant id (charges pass the
 *  merchant id as `merchantRef`; webhooks name the merchant). */
export async function squareTokenForMerchant(merchantId: string) {
  const conn = await prisma.squareConnection.findUnique({ where: { merchantId }, select: CONNECTION_SELECT });
  return tokenFor(conn);
}

// ─── Sweep (hourly cron step `squareTokens`) ─────────────────────────────────

/**
 * Refresh every connection older than 7 days, then page about any that is
 * still older than 8 — Square's "flag stale tokens" rule. Returns how many
 * were refreshed. Never throws for one bad row.
 */
export async function runSquareTokenSweep(now = new Date()): Promise<number> {
  if (!square.squareConfigured()) return 0;
  const due = await prisma.squareConnection.findMany({
    where: { refreshedAt: { lt: new Date(now.getTime() - REFRESH_AFTER_MS) }, refreshTokenEnc: { not: STATIC_TOKEN } },
    select: CONNECTION_SELECT,
    orderBy: { refreshedAt: "asc" },
    take: 200,
  });
  let refreshed = 0;
  for (const conn of due) {
    try {
      await refreshConnection(conn);
      refreshed++;
    } catch (err) {
      if (!(err instanceof SquareNotConnectedError)) {
        console.warn(`[square] refresh failed for company ${conn.companyId}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  const stale = await prisma.squareConnection.findMany({
    where: { refreshedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) }, refreshTokenEnc: { not: STATIC_TOKEN } },
    select: { companyId: true, refreshedAt: true, lastRefreshError: true },
  });
  if (stale.length) {
    reportError(
      "[square] stale OAuth tokens — refresh has failed for over 8 days",
      new Error(stale.map((s) => `${s.companyId} (since ${s.refreshedAt.toISOString()}: ${s.lastRefreshError ?? "?"})`).join("; "))
    );
  }
  await runSquarePayoutSweep(now).catch((err) => {
    console.warn("[square] payout sweep failed:", err instanceof Error ? err.message : err);
  });
  return refreshed;
}

// ─── Payout readiness ───────────────────────────────────────────────────────

/** Re-checked this often while a connection has no verified bank account. */
export const PAYOUT_RECHECK_MS = 6 * 3_600_000;

/**
 * Ask Square whether the seller has a bank account it can pay out to and
 * remember the answer (SquareConnection.payoutStatus / payoutCheckedAt). The
 * "add your bank account" nudge on Home and the Settings card read the
 * stored value, so page loads never call Square. A grant from before
 * BANK_ACCOUNTS_READ answers 403 → UNKNOWN (no nudge; reconnecting adds the
 * scope). Any other failure leaves the stored value alone and returns null.
 */
export async function refreshSquarePayoutStatus(companyId: string): Promise<square.SquarePayoutStatus | null> {
  let status: square.SquarePayoutStatus;
  try {
    const { token } = await squareTokenForCompany(companyId);
    status = square.payoutStatusFromBankAccounts(await square.listSquareBankAccounts(token));
  } catch (err) {
    if (err instanceof square.SquareError && err.status === 403) {
      status = "UNKNOWN";
    } else {
      if (!(err instanceof SquareNotConnectedError)) {
        console.warn(`[square] bank-account check failed for company ${companyId}:`, err instanceof Error ? err.message : err);
      }
      return null;
    }
  }
  await prisma.squareConnection.updateMany({
    where: { companyId },
    data: { payoutStatus: status, payoutCheckedAt: new Date() },
  });
  return status;
}

/** Hourly (inside the token sweep): re-check connections that still lack a
 *  verified bank account, at most every PAYOUT_RECHECK_MS each. UNKNOWN
 *  rows are left alone — only a reconnect changes what the grant can read. */
export async function runSquarePayoutSweep(now = new Date()): Promise<number> {
  const due = await prisma.squareConnection.findMany({
    where: {
      AND: [
        { OR: [{ payoutStatus: null }, { payoutStatus: { in: ["PENDING", "NONE"] } }] },
        { OR: [{ payoutCheckedAt: null }, { payoutCheckedAt: { lt: new Date(now.getTime() - PAYOUT_RECHECK_MS) } }] },
      ],
    },
    select: { companyId: true },
    orderBy: { payoutCheckedAt: { sort: "asc", nulls: "first" } },
    take: 100,
  });
  let checked = 0;
  for (const conn of due) {
    if ((await refreshSquarePayoutStatus(conn.companyId)) !== null) checked++;
  }
  return checked;
}

// ─── Disconnect / revocation ────────────────────────────────────────────────

/** Owner pressed Disconnect: revoke at Square (best effort), forget the
 *  tokens, clear the company's handles. Saved cards stay as rows but can no
 *  longer be charged (they belong to the seller's Square account). */
export async function disconnectSquare(companyId: string): Promise<void> {
  const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: CONNECTION_SELECT });
  if (conn) {
    await square.revokeSquareTokens({ merchantId: conn.merchantId }).catch((err) => {
      // Already revoked from the Square side, or Square is down — the local
      // teardown is what matters; the token dies on its own within 30 days.
      console.warn("[square] revoke on disconnect failed:", err instanceof Error ? err.message : err);
    });
  }
  await clearConnection(companyId);
}

/** Square told us (webhook) or showed us (refresh rejected) the grant is gone. */
export async function markSquareRevoked(merchantId: string, reason: string): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { squareMerchantId: merchantId },
    select: { id: true },
  });
  if (!company) return;
  await clearConnection(company.id);
  const owners = await prisma.user.findMany({
    where: { companyId: company.id, role: "OWNER", isActive: true },
    select: { id: true },
  });
  await notifyUsers(
    owners.map((o) => o.id),
    {
      title: "Square was disconnected",
      body:
        reason === "refresh_rejected"
          ? "Your Square connection expired, so online payments are paused. Reconnect it in Settings → Online Payments."
          : "Square access for WorkBench was removed, so online payments are paused. Reconnect it in Settings → Online Payments.",
      url: "/app/settings",
      tag: "square-revoked",
    }
  ).catch(() => {});
}

async function clearConnection(companyId: string): Promise<void> {
  await prisma.$transaction([
    prisma.squareConnection.deleteMany({ where: { companyId } }),
    prisma.company.update({
      where: { id: companyId },
      data: { squareMerchantId: null, squareLocationId: null, squareConnectedAt: null },
    }),
  ]);
}

// ─── Status (Settings card) ─────────────────────────────────────────────────

export type SquareStatus =
  | { connected: false }
  | {
      connected: true;
      merchantId: string;
      businessName: string | null;
      locationName: string | null;
      connectedAt: Date | null;
      refreshedAt: Date;
      expiresAt: Date;
      /** The refresh has been failing — the token is still usable until
       *  expiresAt, but someone should look. */
      stale: boolean;
      lastRefreshError: string | null;
      /** The grant carries PAYMENTS_WRITE_IN_PERSON — Tap to Pay in the phone app can authorize. */
      inPerson: boolean;
      /**
       * Scopes WorkBench asks for today (SQUARE_SCOPES + extras) that this
       * grant was made without — adding a scope means the seller re-authorizes
       * once (2026-10-28: PAYOUTS_READ / DISPUTES_READ / DISPUTES_WRITE for the
       * Payouts and Disputes tabs). Empty = up to date. `inPerson` is the
       * older single-scope form of the same check.
       */
      missingScopes: string[];
      /** Is there a bank account Square can pay out to? (refreshSquarePayoutStatus; null = never checked) */
      payout: square.SquarePayoutStatus | null;
      payoutCheckedAt: Date | null;
    };

/** The scopes a company's grant should carry: every seller's, plus plan billing's for WorkBench's own company. */
export function scopesWantedFor(isPlatform: boolean): string[] {
  return isPlatform ? Array.from(new Set([...square.squareScopes(), ...square.PLATFORM_BILLING_SCOPES])) : square.squareScopes();
}

/** Which of `wanted` the stored space-separated grant lacks (pure). */
export function scopesMissingFrom(stored: string | null | undefined, wanted: readonly string[] = square.squareScopes()): string[] {
  const have = new Set((stored ?? "").split(/[\s,]+/).filter(Boolean));
  return wanted.filter((s) => !have.has(s));
}

export async function squareStatusForCompany(companyId: string): Promise<SquareStatus> {
  const conn = await prisma.squareConnection.findUnique({
    where: { companyId },
    select: {
      merchantId: true,
      businessName: true,
      locationName: true,
      refreshedAt: true,
      expiresAt: true,
      lastRefreshError: true,
      scopes: true,
      payoutStatus: true,
      payoutCheckedAt: true,
      company: { select: { squareConnectedAt: true, isPlatform: true } },
    },
  });
  if (!conn) return { connected: false };
  return {
    connected: true,
    merchantId: conn.merchantId,
    businessName: conn.businessName,
    locationName: conn.locationName,
    connectedAt: conn.company.squareConnectedAt,
    refreshedAt: conn.refreshedAt,
    expiresAt: conn.expiresAt,
    stale: Date.now() - conn.refreshedAt.getTime() > STALE_AFTER_MS,
    lastRefreshError: conn.lastRefreshError,
    inPerson: hasInPersonScope(conn.scopes),
    missingScopes: scopesMissingFrom(conn.scopes, scopesWantedFor(conn.company.isPlatform)),
    payout: (conn.payoutStatus as square.SquarePayoutStatus | null) ?? null,
    payoutCheckedAt: conn.payoutCheckedAt,
  };
}

/** Square's recommended liveness probe, used by the Settings card's
 *  "Check connection": ListLocations with the seller token. */
export async function probeSquareConnection(
  companyId: string
): Promise<{ ok: true; payout: square.SquarePayoutStatus | null } | { ok: false; error: string }> {
  try {
    const { token } = await squareTokenForCompany(companyId);
    await square.listSquareLocations(token);
    // The same button doubles as "I've added my bank account — check again"
    const payout = await refreshSquarePayoutStatus(companyId).catch(() => null);
    return { ok: true, payout };
  } catch (err) {
    if (err instanceof square.SquareError && err.authDead) {
      const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: { merchantId: true } });
      if (conn) await markSquareRevoked(conn.merchantId, "probe_unauthorized");
      return { ok: false, error: "Square no longer accepts the connection — reconnect it." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Square." };
  }
}
