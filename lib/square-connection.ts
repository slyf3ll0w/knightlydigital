import { reportError } from "@/lib/report-error";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/push";
import { openSecret, sealSecret, signMessage } from "@/lib/secret-box";
import * as square from "@/lib/square";

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

export function squareAuthorizeUrlFor(companyId: string, userId: string): string {
  return square.buildSquareAuthorizeUrl({ state: buildSquareState(companyId, userId) });
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

  const now = new Date();
  const expiresAt = new Date(tokens.expires_at);
  await prisma.$transaction([
    prisma.squareConnection.upsert({
      where: { companyId: params.companyId },
      create: {
        companyId: params.companyId,
        merchantId: tokens.merchant_id,
        accessTokenEnc: sealSecret(tokens.access_token, SECRET_SCOPE),
        refreshTokenEnc: sealSecret(tokens.refresh_token, SECRET_SCOPE),
        expiresAt,
        scopes: square.squareScopes().join(" "),
        businessName: merchant?.business_name ?? location.business_name ?? null,
        locationName: location.name ?? null,
        currency: location.currency ?? merchant?.currency ?? "USD",
        country: location.country ?? merchant?.country ?? null,
        refreshedAt: now,
        lastRefreshError: null,
        lastRefreshErrorAt: null,
      },
      update: {
        merchantId: tokens.merchant_id,
        accessTokenEnc: sealSecret(tokens.access_token, SECRET_SCOPE),
        refreshTokenEnc: sealSecret(tokens.refresh_token, SECRET_SCOPE),
        expiresAt,
        scopes: square.squareScopes().join(" "),
        businessName: merchant?.business_name ?? location.business_name ?? null,
        locationName: location.name ?? null,
        currency: location.currency ?? merchant?.currency ?? "USD",
        country: location.country ?? merchant?.country ?? null,
        refreshedAt: now,
        lastRefreshError: null,
        lastRefreshErrorAt: null,
      },
    }),
    prisma.company.update({
      where: { id: params.companyId },
      data: {
        squareMerchantId: tokens.merchant_id,
        squareLocationId: location.id,
        squareConnectedAt: now,
      },
    }),
  ]);

  return {
    merchantId: tokens.merchant_id,
    locationId: location.id,
    businessName: merchant?.business_name ?? location.business_name ?? null,
    locationName: location.name ?? null,
  };
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

function needsRefresh(conn: ConnectionRow, now = Date.now()): boolean {
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
    where: { refreshedAt: { lt: new Date(now.getTime() - REFRESH_AFTER_MS) } },
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
    where: { refreshedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    select: { companyId: true, refreshedAt: true, lastRefreshError: true },
  });
  if (stale.length) {
    reportError(
      "[square] stale OAuth tokens — refresh has failed for over 8 days",
      new Error(stale.map((s) => `${s.companyId} (since ${s.refreshedAt.toISOString()}: ${s.lastRefreshError ?? "?"})`).join("; "))
    );
  }
  return refreshed;
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
    };

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
      company: { select: { squareConnectedAt: true } },
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
  };
}

/** Square's recommended liveness probe, used by the Settings card's
 *  "Check connection": ListLocations with the seller token. */
export async function probeSquareConnection(companyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { token } = await squareTokenForCompany(companyId);
    await square.listSquareLocations(token);
    return { ok: true };
  } catch (err) {
    if (err instanceof square.SquareError && err.authDead) {
      const conn = await prisma.squareConnection.findUnique({ where: { companyId }, select: { merchantId: true } });
      if (conn) await markSquareRevoked(conn.merchantId, "probe_unauthorized");
      return { ok: false, error: "Square no longer accepts the connection — reconnect it." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach Square." };
  }
}
