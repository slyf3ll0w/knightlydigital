/**
 * Connect Google Ads (one click, 2026-11-18): the owner signs in with Google
 * once, and WorkBench reports paid jobs by itself. No file address, no field
 * mapping, nothing to schedule in Google Ads.
 *
 *   connect  → Google's consent screen (scopes: adwords + datamanager)
 *   callback → tokens stored (AES-256-GCM, keyed off AUTH_SECRET, like
 *              lib/google-calendar.ts) → the accounts the person can reach
 *              are listed → with exactly one, it is picked for them
 *   pick     → the "WorkBench paid job" conversion action is found by name
 *              or created in that account
 *   sync     → the same rows the file holds (lib/ads-conversions.ts) go to
 *              Google through the Data Manager API. Each payment carries
 *              its own id as transactionId, so sending it again is harmless
 *              and nothing has to remember what was sent. Runs from the
 *              hourly cron (at most every SYNC_EVERY_HOURS per company) and
 *              from "Send now".
 *
 * One connection per COMPANY. Env (the button is invisible until both are
 * set): GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET. They may be the
 * same OAuth client as Google Calendar; the Cloud project needs the Google
 * Ads API and the Data Manager API enabled.
 * Redirect URI: `${NEXTAUTH_URL}/api/app/integrations/google-ads/callback`.
 *
 * Shapes and parsers are pure in lib/google-ads-shape.ts.
 * Plan + what David has to do at Google: docs/plans/ads-connect-2026-11-18.md
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { GoogleAdsConnection } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { loadAdsConversions } from "@/lib/ads-conversions-server";
import {
  CLIENT_ACCOUNTS_QUERY,
  CONVERSION_ACTION_QUERY,
  DATA_MANAGER_INGEST_URL,
  GOOGLE_ADS_API,
  GOOGLE_ADS_SCOPES,
  createConversionActionBody,
  customerIdDigits,
  googleErrorText,
  ingestBodies,
  mergeAccounts,
  needsReconnect,
  parseAccessibleCustomers,
  parseClientAccounts,
  parseConversionAction,
  parseCreatedActionId,
  type AdsAccount,
} from "@/lib/google-ads-shape";

const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/** The cron runs hourly; a company's payments go to Google at most this often. */
const SYNC_EVERY_HOURS = 6;
/** Reachable accounts asked for their client accounts on one connect (an agency login can reach hundreds). */
const MAX_LOGIN_ACCOUNTS = 15;

export function isGoogleAdsConfigured(): boolean {
  return !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/app/integrations/google-ads/callback`;
}

/** What went wrong at Google, in words the page can show. `reconnect` = the sign-in itself is dead. */
export class GoogleAdsError extends Error {
  constructor(
    message: string,
    public readonly reconnect = false
  ) {
    super(message);
  }
}

// ─── Token encryption ────────────────────────────────────────────────────────

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to store Google Ads tokens");
  return createHash("sha256").update(`gads-token:${secret}`).digest();
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

// state = companyId.userId.expiresAtMs.hmac, 10 minutes. The callback also
// requires the signed-in person to be that user in that company.
function stateSignature(companyId: string, userId: string, expiresAt: number): string {
  return createHmac("sha256", encryptionKey()).update(`${companyId}.${userId}.${expiresAt}`).digest("hex");
}

export function buildAuthorizeUrl(actor: { id: string; companyId: string }): string {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const state = `${actor.companyId}.${actor.id}.${expiresAt}.${stateSignature(actor.companyId, actor.id, expiresAt)}`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
    response_type: "code",
    scope: GOOGLE_ADS_SCOPES.join(" "),
    redirect_uri: redirectUri(),
    state,
    // offline + consent = a refresh token every time, not just the first
    access_type: "offline",
    prompt: "consent",
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export function verifyState(state: string): { companyId: string; userId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [companyId, userId, expiresRaw, sig] = parts;
  const expiresAt = Number(expiresRaw);
  if (!companyId || !userId || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  const want = Buffer.from(stateSignature(companyId, userId, expiresAt));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? { companyId, userId } : null;
}

// ─── OAuth: tokens ───────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function requestTokens(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...body,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    // invalid_grant = access removed at Google, a password change, or the sign-in expired
    throw new GoogleAdsError(json.error_description ?? json.error ?? `Google token request failed (${res.status})`, json.error === "invalid_grant");
  }
  return json;
}

async function accessTokenFor(connection: GoogleAdsConnection): Promise<string> {
  if (connection.accessTokenExpiresAt.getTime() - Date.now() > 60_000) return decryptToken(connection.accessTokenEnc);
  const tokens = await requestTokens({ grant_type: "refresh_token", refresh_token: decryptToken(connection.refreshTokenEnc) });
  await prisma.googleAdsConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptToken(tokens.access_token),
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      ...(tokens.refresh_token ? { refreshTokenEnc: encryptToken(tokens.refresh_token) } : {}),
    },
  });
  return tokens.access_token;
}

// ─── Google calls ────────────────────────────────────────────────────────────

async function googleJson(url: string, token: string, init: { method?: "GET" | "POST"; body?: unknown; loginCustomerId?: string } = {}): Promise<unknown> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.loginCustomerId ? { "login-customer-id": init.loginCustomerId } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new GoogleAdsError(googleErrorText(json, res.status), needsReconnect(res.status, json));
  return json;
}

const adsSearch = (token: string, customerId: string, loginCustomerId: string, query: string) =>
  googleJson(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:search`, token, { body: { query }, loginCustomerId });

/** Every plain (non-manager) Google Ads account the connected person can reach, directly or through a manager account. */
export async function listAccounts(connection: GoogleAdsConnection): Promise<AdsAccount[]> {
  const token = await accessTokenFor(connection);
  const reachable = parseAccessibleCustomers(await googleJson(`${GOOGLE_ADS_API}/customers:listAccessibleCustomers`, token));
  const lists: AdsAccount[][] = [];
  let firstError: unknown = null;
  for (const login of reachable.slice(0, MAX_LOGIN_ACCOUNTS)) {
    try {
      lists.push(parseClientAccounts(await adsSearch(token, login, login, CLIENT_ACCOUNTS_QUERY), login));
    } catch (err) {
      // a cancelled or suspended account in the list must not hide the good ones
      firstError ??= err;
    }
  }
  const accounts = mergeAccounts(lists);
  if (accounts.length === 0 && firstError) throw firstError;
  return accounts;
}

/** The id of the "WorkBench paid job" action in an account: the one already there, or a new one. */
async function ensureConversionAction(token: string, account: AdsAccount): Promise<{ id: string; created: boolean }> {
  const found = parseConversionAction(await adsSearch(token, account.customerId, account.loginCustomerId, CONVERSION_ACTION_QUERY));
  if (found?.usable) return { id: found.id, created: false };
  if (found) throw new GoogleAdsError(found.why ?? "The conversion action in Google Ads can't be used.");
  const made = await googleJson(`${GOOGLE_ADS_API}/customers/${account.customerId}/conversionActions:mutate`, token, {
    body: createConversionActionBody(),
    loginCustomerId: account.loginCustomerId,
  });
  const id = parseCreatedActionId(made);
  if (!id) throw new GoogleAdsError("Google created the conversion action but did not say which one. Press Connect again.");
  return { id, created: true };
}

// ─── Connect / pick / disconnect ─────────────────────────────────────────────

/** Finishes Google's redirect: stores the sign-in, and picks the account when the person only has one. */
export async function connectCompany(opts: { companyId: string; userId: string; code: string }): Promise<"connected" | "pick_account" | "no_accounts"> {
  const tokens = await requestTokens({ grant_type: "authorization_code", code: opts.code, redirect_uri: redirectUri() });
  if (!tokens.refresh_token) throw new GoogleAdsError("Google didn't return a lasting sign-in. Press Connect again.");
  const granted = (tokens.scope ?? "").split(" ");
  if (tokens.scope && !GOOGLE_ADS_SCOPES.slice(0, 2).every((s) => granted.includes(s))) {
    throw new GoogleAdsError("Google's screen has two boxes for WorkBench, and both need a tick. Press Connect again and tick them.");
  }
  const who = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15_000) });
  const info = (await who.json().catch(() => ({}))) as { email?: string };

  const data = {
    connectedById: opts.userId,
    googleEmail: info.email ?? "Google account",
    accessTokenEnc: encryptToken(tokens.access_token),
    refreshTokenEnc: encryptToken(tokens.refresh_token),
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope ?? GOOGLE_ADS_SCOPES.join(" "),
    // a (re)connect may be a different Google login: start over
    customerId: null,
    loginCustomerId: null,
    accountName: null,
    conversionActionId: null,
    actionCreatedAt: null,
    lastSyncAt: null,
    lastSyncCount: null,
    lastError: null,
    needsReconnect: false,
  };
  const connection = await prisma.googleAdsConnection.upsert({
    where: { companyId: opts.companyId },
    create: { companyId: opts.companyId, ...data },
    update: data,
  });

  const accounts = await listAccounts(connection);
  if (accounts.length === 0) return "no_accounts";
  if (accounts.length > 1) return "pick_account";
  await useAccount(connection, accounts[0]);
  return "connected";
}

async function useAccount(connection: GoogleAdsConnection, account: AdsAccount): Promise<void> {
  const token = await accessTokenFor(connection);
  const action = await ensureConversionAction(token, account);
  await prisma.googleAdsConnection.update({
    where: { id: connection.id },
    data: {
      customerId: account.customerId,
      loginCustomerId: account.loginCustomerId,
      accountName: account.name,
      conversionActionId: action.id,
      actionCreatedAt: action.created ? new Date() : null,
      lastError: null,
      needsReconnect: false,
    },
  });
}

/** The owner picked one of several accounts. Only an account Google itself lists for this sign-in is accepted. */
export async function chooseAccount(companyId: string, customerIdRaw: unknown): Promise<void> {
  const connection = await prisma.googleAdsConnection.findUnique({ where: { companyId } });
  if (!connection) throw new GoogleAdsError("Connect Google Ads first.");
  const want = customerIdDigits(customerIdRaw);
  const account = (await listAccounts(connection)).find((a) => a.customerId === want);
  if (!account) throw new GoogleAdsError("That Google Ads account isn't one this sign-in can use.");
  await useAccount(connection, account);
}

export async function disconnectCompany(companyId: string): Promise<void> {
  const connection = await prisma.googleAdsConnection.findUnique({ where: { companyId } });
  if (!connection) return;
  try {
    await fetch(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(decryptToken(connection.refreshTokenEnc))}`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch {
    // best effort: the owner can also remove WorkBench from their Google account page
  }
  await prisma.googleAdsConnection.delete({ where: { id: connection.id } });
}

// ─── Sending the payments ────────────────────────────────────────────────────

export type AdsSyncResult = { ok: true; sent: number } | { ok: false; error: string };

/** Sends every payment Google will still accept. Safe to run again: Google drops a payment it already has. */
export async function syncCompany(companyId: string, now = new Date()): Promise<AdsSyncResult> {
  const connection = await prisma.googleAdsConnection.findUnique({ where: { companyId } });
  if (!connection?.customerId || !connection.conversionActionId) return { ok: false, error: "Google Ads isn't fully connected yet." };
  try {
    const summary = await loadAdsConversions(companyId, now);
    if (summary.rows.length > 0) {
      const token = await accessTokenFor(connection);
      const bodies = ingestBodies(summary.rows, {
        customerId: connection.customerId,
        loginCustomerId: connection.loginCustomerId ?? connection.customerId,
        conversionActionId: connection.conversionActionId,
      });
      for (const body of bodies) await googleJson(DATA_MANAGER_INGEST_URL, token, { body });
    }
    await prisma.googleAdsConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: now, lastSyncCount: summary.rows.length, lastError: null, needsReconnect: false },
    });
    return { ok: true, sent: summary.rows.length };
  } catch (err) {
    const reconnect = err instanceof GoogleAdsError && err.reconnect;
    const message = err instanceof GoogleAdsError ? err.message : "WorkBench couldn't reach Google.";
    if (!(err instanceof GoogleAdsError)) reportError("[google-ads] sync failed", err);
    await prisma.googleAdsConnection
      .update({ where: { id: connection.id }, data: { lastError: message.slice(0, 400), ...(reconnect ? { needsReconnect: true } : {}) } })
      .catch(() => {});
    return { ok: false, error: message };
  }
}

/** Cron step: every connected company whose payments have not gone to Google in the last few hours. No-op without the env vars. */
export async function runGoogleAdsSweep(now = new Date()): Promise<{ companies: number; sent: number; failed: number }> {
  if (!isGoogleAdsConfigured()) return { companies: 0, sent: 0, failed: 0 };
  const due = await prisma.googleAdsConnection.findMany({
    where: {
      needsReconnect: false,
      customerId: { not: null },
      conversionActionId: { not: null },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - SYNC_EVERY_HOURS * 3600000) } }],
      company: { suspendedAt: null },
    },
    select: { companyId: true },
    take: 200,
  });
  let sent = 0;
  let failed = 0;
  for (const c of due) {
    const r = await syncCompany(c.companyId, now);
    if (r.ok) sent += r.sent;
    else failed += 1;
  }
  return { companies: due.length, sent, failed };
}

// ─── Status for the page and the Atlas tool ──────────────────────────────────

export type AdsConnectStatus = {
  /** The Connect button exists on this server (env vars set). */
  available: boolean;
  connected: boolean;
  googleEmail: string | null;
  /** Null while an account still has to be picked. */
  accountName: string | null;
  customerId: string | null;
  needsAccount: boolean;
  needsReconnect: boolean;
  lastSyncAt: string | null;
  lastSyncCount: number | null;
  lastError: string | null;
};

export async function loadAdsConnectStatus(companyId: string): Promise<AdsConnectStatus> {
  const available = isGoogleAdsConfigured();
  const c = available ? await prisma.googleAdsConnection.findUnique({ where: { companyId } }) : null;
  return {
    available,
    connected: !!c,
    googleEmail: c?.googleEmail ?? null,
    accountName: c?.accountName ?? null,
    customerId: c?.customerId ?? null,
    needsAccount: !!c && !c.customerId,
    needsReconnect: c?.needsReconnect ?? false,
    lastSyncAt: c?.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    lastSyncCount: c?.lastSyncCount ?? null,
    lastError: c?.lastError ?? null,
  };
}

/** The accounts to pick from, for a connection that has not picked yet. */
export async function accountsToPick(companyId: string): Promise<AdsAccount[]> {
  const connection = await prisma.googleAdsConnection.findUnique({ where: { companyId } });
  if (!connection) return [];
  return listAccounts(connection);
}
