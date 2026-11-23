/**
 * The Workbench connector: sign-in for outside AI apps
 * (docs/plans/workbench-connector-2026-11-17.md).
 *
 * Workbench is the OAuth 2.1 server the connector standard (MCP
 * authorization, revision 2026-07-28) asks for:
 *   - an app identifies itself by a metadata URL (Client ID Metadata
 *     Documents, the standard's preferred way) or by registering
 *     (dynamic client registration, for older apps);
 *   - a person approves the connection on /connect, signed in as themselves;
 *   - the app swaps a one-time code (PKCE, S256 only) for a 1-hour access
 *     token and a single-use 60-day refresh token.
 * Only the SHA-256 of a code or token is stored. Every call made with a token
 * runs as the person who approved it, with their role — owners and admins
 * only — and stops the moment the connection is removed, their password
 * changes, they are deactivated, or the owner turns outside apps off.
 */
import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { isManager, type Actor, type Role } from "@/lib/permissions";
import { issuer } from "./metadata";

export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 60 * 86_400_000;
export const CODE_TTL_MS = 5 * 60_000;
/** A refresh token replayed inside this window is a network retry, not theft. */
const REPLAY_GRACE_MS = 60_000;

export { issuer, connectorUrl } from "./metadata";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const mint = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

// ── the app that is asking ───────────────────────────────────────────────────

export type ConnectorClientInfo = { clientId: string; name: string; redirectUris: string[] };

const cleanName = (raw: unknown, fallback: string) =>
  (typeof raw === "string" ? raw : "")
    .replace(/[^\p{L}\p{N} .,'&()\-]/gu, "")
    .trim()
    .slice(0, 60) || fallback;

/**
 * An app names itself, so a name alone proves nothing: anyone could register
 * as "Claude" and have the consent page ask "Let Claude use WorkBench?" while
 * the sign-in returns to their own server. A name that uses one of these
 * brands is kept only when every return address is that brand's own site (or
 * the person's own machine, where a desktop app listens). Otherwise the app
 * is shown by where it returns to (2026-11-23 security review). Pure.
 */
const BRAND_HOSTS: Array<{ brand: RegExp; hosts: RegExp }> = [
  { brand: /claude|anthropic/i, hosts: /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/ },
  { brand: /chat\s*gpt|open\s*ai/i, hosts: /(^|\.)(chatgpt\.com|openai\.com)$/ },
  { brand: /work\s*bench|atlas/i, hosts: /(^|\.)workbenchfsm\.com$/ },
  { brand: /google|gemini/i, hosts: /(^|\.)google\.com$/ },
  { brand: /microsoft|copilot/i, hosts: /(^|\.)(microsoft\.com|live\.com)$/ },
];
export function honestName(name: string, redirectUris: string[]): string {
  const claimed = BRAND_HOSTS.filter((b) => b.brand.test(name));
  if (claimed.length === 0) return name;
  const hosts: string[] = [];
  for (const uri of redirectUris) {
    try {
      const u = new URL(uri);
      if (!isLoopback(u)) hosts.push(u.hostname.toLowerCase());
    } catch {
      return "An app";
    }
  }
  const honest = claimed.every((b) => hosts.every((h) => b.hosts.test(h)));
  return honest ? name : `An app at ${hosts.find((h) => !claimed.some((b) => b.hosts.test(h))) ?? "an unknown address"}`;
}

/** A redirect address an app may use: https anywhere, or http on the person's own machine (desktop apps). */
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    if (u.hash || u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  } catch {
    return false;
  }
}

function isLoopback(u: URL): boolean {
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
}

/** Exact match, except a desktop app's loopback address may use any port (RFC 8252). */
export function redirectAllowed(client: ConnectorClientInfo, uri: string): boolean {
  if (!validRedirectUri(uri)) return false;
  const want = new URL(uri);
  return client.redirectUris.some((r) => {
    if (r === uri) return true;
    try {
      const have = new URL(r);
      return isLoopback(have) && isLoopback(want) && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search;
    } catch {
      return false;
    }
  });
}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** A response body as text, or null once it passes `max` bytes: the rest is never read into memory. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (Number(res.headers.get("content-length") ?? 0) > max) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * An app that identifies by a metadata URL: fetch the document and read its
 * name and redirect addresses. The URL is the app's choice, so it is only
 * fetched when it is plain https to a public host, never followed through a
 * redirect, and capped in time and size.
 */
async function clientFromMetadataUrl(clientId: string): Promise<ConnectorClientInfo | null> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.pathname === "/" || isIP(url.hostname.replace(/^\[|\]$/g, "")) || !url.hostname.includes(".")) return null;
  try {
    const found = await lookup(url.hostname, { all: true });
    if (found.length === 0 || found.some((a) => privateAddress(a.address))) return null;
    // Anyone can open /connect with any address, signed in or not, so the
    // fetch is rationed: per host and overall (2026-11-23 security review).
    const perHost = await limit(`connector-meta:${url.hostname.toLowerCase()}`, 120, 10 * 60_000);
    const overall = await limit("connector-meta", 600, 10 * 60_000);
    if (!perHost.ok || !overall.ok) return null;
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const text = await readCapped(res, 20_000);
    if (text === null) return null;
    const doc = JSON.parse(text) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
    if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
    const redirectUris = doc.redirect_uris.filter(validRedirectUri).slice(0, 10);
    if (redirectUris.length === 0) return null;
    return { clientId, name: honestName(cleanName(doc.client_name, url.hostname), redirectUris), redirectUris };
  } catch {
    return null;
  }
}

export async function resolveClient(clientId: unknown): Promise<ConnectorClientInfo | null> {
  if (typeof clientId !== "string" || !clientId || clientId.length > 500) return null;
  if (clientId.startsWith("https://")) return clientFromMetadataUrl(clientId);
  const row = await prisma.connectorClient.findUnique({ where: { clientId } });
  if (!row) return null;
  const redirectUris = Array.isArray(row.redirectUris) ? row.redirectUris.filter(validRedirectUri) : [];
  return { clientId: row.clientId, name: honestName(row.name, redirectUris), redirectUris };
}

/** Dynamic client registration: an app registers its name and redirect addresses and gets an id (no secret — PKCE protects the exchange). */
export async function registerClient(body: { client_name?: unknown; redirect_uris?: unknown }): Promise<ConnectorClientInfo | { error: string }> {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) return { error: "redirect_uris must be 1 to 10 https (or loopback http) addresses." };
  const clientId = mint("wbc");
  const name = honestName(cleanName(body.client_name, "An AI app"), uris as string[]);
  await prisma.connectorClient.create({ data: { clientId, name, redirectUris: uris } });
  return { clientId, name, redirectUris: uris as string[] };
}

// ── who may connect ──────────────────────────────────────────────────────────

type Member = { id: string; name: string; role: string; companyId: string | null; isActive: boolean; company: { salesSeePayments: boolean; suspendedAt: Date | null; connectorsOff: boolean } | null; account: { passwordChangedAt: Date | null } | null };
const MEMBER_SELECT = {
  id: true,
  name: true,
  role: true,
  companyId: true,
  isActive: true,
  company: { select: { salesSeePayments: true, suspendedAt: true, connectorsOff: true } },
  account: { select: { passwordChangedAt: true } },
} as const;

/** Why this person cannot have a connection right now, or null when they can. */
export function connectBlock(m: Pick<Member, "role" | "isActive" | "companyId" | "company"> | null): "gone" | "role" | "off" | null {
  if (!m || !m.isActive || !m.companyId || !m.company || m.company.suspendedAt) return "gone";
  if (!isManager(m.role as Role)) return "role";
  if (m.company.connectorsOff) return "off";
  return null;
}

// ── the one-time code ────────────────────────────────────────────────────────

export async function createAuthCode(opts: { userId: string; client: ConnectorClientInfo; redirectUri: string; codeChallenge: string }): Promise<string> {
  const code = mint("wbcode");
  await prisma.connectorAuthCode.create({
    data: { codeHash: sha256(code), userId: opts.userId, clientId: opts.client.clientId, clientName: opts.client.name, redirectUri: opts.redirectUri, codeChallenge: opts.codeChallenge, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return code;
}

/** PKCE, S256: the app proves it is the one that started the sign-in. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export type TokenPair = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string };
export type OAuthError = { error: "invalid_request" | "invalid_grant" | "invalid_client" | "unsupported_grant_type"; error_description: string };

async function issueTokens(db: Pick<typeof prisma, "connectorToken">, grantId: string): Promise<TokenPair> {
  const access = mint("wbat");
  const refresh = mint("wbrt");
  const now = Date.now();
  await db.connectorToken.createMany({
    data: [
      { grantId, kind: "access", tokenHash: sha256(access), expiresAt: new Date(now + ACCESS_TTL_MS) },
      { grantId, kind: "refresh", tokenHash: sha256(refresh), expiresAt: new Date(now + REFRESH_TTL_MS) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh };
}

/** The app's first token request: the code from /connect, its PKCE verifier, and the same client and redirect address. */
export async function exchangeCode(body: { code?: unknown; client_id?: unknown; redirect_uri?: unknown; code_verifier?: unknown }): Promise<TokenPair | OAuthError> {
  const bad = (d: string): OAuthError => ({ error: "invalid_grant", error_description: d });
  if (typeof body.code !== "string") return { error: "invalid_request", error_description: "code is required." };
  const row = await prisma.connectorAuthCode.findUnique({ where: { codeHash: sha256(body.code) }, include: { user: { select: MEMBER_SELECT } } });
  if (!row || row.expiresAt.getTime() < Date.now()) return bad("That code is not valid or has expired.");
  if (row.clientId !== body.client_id || row.redirectUri !== body.redirect_uri) return bad("client_id or redirect_uri does not match the sign-in.");
  if (!pkceMatches(body.code_verifier, row.codeChallenge)) return bad("code_verifier does not match.");
  if (connectBlock(row.user)) return bad("This person can no longer connect apps.");
  // single use: the claim is the update itself, so two requests with one code cannot both win
  const claim = await prisma.connectorAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claim.count === 0) return bad("That code was already used.");
  return prisma.$transaction(async (tx) => {
    const grant = await tx.connectorGrant.create({ data: { companyId: row.user.companyId!, userId: row.userId, clientId: row.clientId, clientName: row.clientName }, select: { id: true } });
    return issueTokens(tx, grant.id);
  });
}

/** A refresh token buys a new pair once. Used twice (outside a retry's few seconds) means it leaked: the whole connection ends. */
export async function refreshTokens(body: { refresh_token?: unknown; client_id?: unknown }): Promise<TokenPair | OAuthError> {
  const bad = (d: string): OAuthError => ({ error: "invalid_grant", error_description: d });
  if (typeof body.refresh_token !== "string") return { error: "invalid_request", error_description: "refresh_token is required." };
  const row = await prisma.connectorToken.findUnique({ where: { tokenHash: sha256(body.refresh_token) }, include: { grant: { include: { user: { select: MEMBER_SELECT } } } } });
  if (!row || row.kind !== "refresh" || row.grant.revokedAt || row.expiresAt.getTime() < Date.now()) return bad("That refresh token is not valid.");
  if (row.grant.clientId !== body.client_id) return bad("client_id does not match the connection.");
  if (endReason(row.grant, row.grant.user)) {
    await revokeGrant(row.grantId);
    return bad("This connection has ended.");
  }
  const claim = await prisma.connectorToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claim.count === 0) {
    if (row.usedAt && Date.now() - row.usedAt.getTime() > REPLAY_GRACE_MS) await revokeGrant(row.grantId);
    return bad("That refresh token was already used.");
  }
  return prisma.$transaction(async (tx) => {
    // the old access tokens go with the old refresh token; spent rows are cleared as we go
    await tx.connectorToken.deleteMany({ where: { grantId: row.grantId, OR: [{ kind: "access" }, { expiresAt: { lt: new Date() } }, { usedAt: { lt: new Date(Date.now() - 86_400_000) } }] } });
    return issueTokens(tx, row.grantId);
  });
}

export async function revokeGrant(grantId: string): Promise<void> {
  await prisma.$transaction([
    prisma.connectorGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.connectorToken.deleteMany({ where: { grantId } }),
    prisma.connectorAction.updateMany({ where: { grantId, status: "pending" }, data: { status: "dismissed", decidedAt: new Date(), proposal: {} } }),
  ]);
}

/** Why a connection must end, or null. A password change ends every connection made before it, as it ends sessions. */
function endReason(grant: { createdAt: Date; revokedAt: Date | null }, user: Member | null): string | null {
  if (grant.revokedAt) return "revoked";
  const block = connectBlock(user);
  if (block) return block;
  const changedAt = user?.account?.passwordChangedAt?.getTime() ?? 0;
  if (changedAt && grant.createdAt.getTime() < changedAt) return "password";
  return null;
}

// ── a call arriving with a token ─────────────────────────────────────────────

export type ConnectorCaller = { actor: Actor; grantId: string; clientName: string };

/** The person behind a bearer token, or null. The same checks as a browser session, made on every call. */
export async function callerFromBearer(header: string | null): Promise<ConnectorCaller | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!m) return null;
  const row = await prisma.connectorToken.findUnique({ where: { tokenHash: sha256(m[1]) }, include: { grant: { include: { user: { select: MEMBER_SELECT } } } } });
  if (!row || row.kind !== "access" || row.expiresAt.getTime() < Date.now()) return null;
  const { grant } = row;
  const user = grant.user;
  const why = endReason(grant, user);
  if (why) {
    // gone for good (not "the owner switched apps off", which they may switch back on)
    if (why !== "off" && why !== "revoked") await revokeGrant(grant.id).catch(() => {});
    return null;
  }
  if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > 5 * 60_000) {
    void prisma.connectorGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return {
    actor: { id: user.id, name: user.name, role: user.role as Role, companyId: user.companyId!, salesSeePayments: user.company?.salesSeePayments ?? true },
    grantId: grant.id,
    clientName: grant.clientName,
  };
}
