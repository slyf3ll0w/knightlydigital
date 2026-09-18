/**
 * "Verify it's you" — the recent-authentication step every sensitive account
 * change takes, the way Google, GitHub and Apple gate theirs: before you
 * connect or disconnect a sign-in method, change the sign-in email, set or
 * change the password, or delete the account, you prove you hold the login
 * again — with your password, or with a fresh sign-in through a provider
 * already connected to the account. A login with no password (opened with
 * Google) proves it with Google, so nothing sends it through Forgot password.
 *
 * Proof is a ten-minute grant: an HMAC-signed, account-bound cookie minted by
 * POST /api/app/auth/reauth (password, or a native Google ID token) or by the
 * OAuth callback when a web Google round-trip lands on an identity that
 * belongs to the session's account (app/api/auth/[...nextauth]/route.ts,
 * steered by the intent cookie). Routes check it with `proveIdentity()`.
 *
 * Signed with AUTH_SECRET under its own prefix so the key usage can never
 * collide with NextAuth's or the console's. Web Crypto only, so it runs
 * anywhere the NextAuth handler does.
 */
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifyPasswordForUser } from "@/lib/account";

export const REAUTH_COOKIE = "wb-reauth";
export const REAUTH_INTENT_COOKIE = "wb-reauth-intent";
export const REAUTH_TTL_MS = 10 * 60 * 1000;

export type ReauthVia = "password" | "google" | "apple";

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`wb-reauth:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

async function mint(data: Record<string, unknown>): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(data)));
  return `${payload}.${await sign(payload)}`;
}

async function open(token: string): Promise<Record<string, unknown> | null> {
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await sign(payload);
  // Constant-time compare (both strings are same-alphabet base64url)
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const std = payload.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(std)) as Record<string, unknown>;
    if (typeof data.exp !== "number" || data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** A fresh proof for exactly this account, made by `via`. */
export async function createReauthGrant(accountId: string, via: ReauthVia): Promise<string> {
  return mint({ k: "grant", aid: accountId, via, exp: Date.now() + REAUTH_TTL_MS });
}

/** How the grant was made, or null when it's missing, forged, expired or someone else's. */
export async function verifyReauthGrant(token: string, accountId: string): Promise<ReauthVia | null> {
  const data = await open(token);
  if (!data || data.k !== "grant" || data.aid !== accountId) return null;
  return data.via === "password" || data.via === "google" || data.via === "apple" ? data.via : null;
}

/**
 * The web Google round-trip carries no request body, so the wish to verify
 * (rather than sign in or link) rides in its own short-lived cookie, bound
 * to the account and carrying the page to come back to.
 */
export async function createReauthIntent(accountId: string, returnTo: string): Promise<string> {
  return mint({ k: "intent", aid: accountId, to: returnTo, exp: Date.now() + REAUTH_TTL_MS });
}

export async function verifyReauthIntent(token: string, accountId: string): Promise<string | null> {
  const data = await open(token);
  if (!data || data.k !== "intent" || data.aid !== accountId) return null;
  return typeof data.to === "string" && isSafeReturnTo(data.to) ? data.to : null;
}

/** Only an in-app path — never an absolute URL, never protocol-relative. */
export function isSafeReturnTo(to: unknown): to is string {
  return typeof to === "string" && /^\/app(\/[^\s?#]*)?(\?[^\s#]*)?$/.test(to) && !to.startsWith("//");
}

export function reauthCookieOptions(maxAgeSeconds = Math.floor(REAUTH_TTL_MS / 1000)) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** A raw Set-Cookie header value, for responses we don't build ourselves (NextAuth's). */
export function serializeReauthCookie(name: string, value: string, maxAgeSeconds: number): string {
  const o = reauthCookieOptions(maxAgeSeconds);
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${o.path}`,
    `Max-Age=${o.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(o.secure ? ["Secure"] : []),
  ].join("; ");
}

/** The proof the current request carries for this account, if any. */
export async function freshReauth(accountId: string): Promise<ReauthVia | null> {
  const token = (await cookies()).get(REAUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyReauthGrant(token, accountId);
}

export type IdentityProof =
  | { ok: true; via: ReauthVia }
  | { ok: false; reason: "wrong-password" | "reauth-required" };

/**
 * Did the person behind this membership just prove it's them? A typed
 * password counts on its own (the classic form); otherwise a fresh grant
 * does. Legacy rows with no Account still only have their password.
 */
export async function proveIdentity(userId: string, password?: string | null): Promise<IdentityProof> {
  if (password) {
    return (await verifyPasswordForUser(userId, password))
      ? { ok: true, via: "password" }
      : { ok: false, reason: "wrong-password" };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountId: true },
  });
  if (!user?.accountId) return { ok: false, reason: "reauth-required" };
  const via = await freshReauth(user.accountId);
  return via ? { ok: true, via } : { ok: false, reason: "reauth-required" };
}

/** The message a route sends back when the proof is missing. */
export function proofError(reason: "wrong-password" | "reauth-required"): { error: string; code: string } {
  return reason === "wrong-password"
    ? { error: "Current password is incorrect.", code: "wrong-password" }
    : { error: "Verify it's you first, then try again.", code: "reauth-required" };
}
