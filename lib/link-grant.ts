/**
 * A short-lived proof that the signed-in person just re-entered their
 * password. Minted by POST /api/app/profile/identities/grant, read by the
 * OAuth "Connect Google" round-trip (app/api/auth/[...nextauth]/route.ts).
 *
 * Linking a sign-in method is the one identity edit that can't take the
 * password in the same request — Google's redirect owns that request — so
 * the grant carries the proof across it. Without it, anyone holding a copy
 * of a session cookie (stolen, or a borrowed unlocked device) could weld
 * their own Google account to the login and keep it after a password reset.
 *
 * HMAC-signed with AUTH_SECRET (prefixed so this key usage can never collide
 * with NextAuth's or the console's), bound to the account, ten minutes.
 * Web Crypto only, so it runs anywhere the NextAuth handler does.
 */

export const LINK_GRANT_COOKIE = "wb-link-grant";
export const LINK_GRANT_TTL_MS = 10 * 60 * 1000;

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
    new TextEncoder().encode(`wb-link-grant:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

export async function createLinkGrant(accountId: string): Promise<string> {
  const payload = b64url(
    new TextEncoder().encode(JSON.stringify({ aid: accountId, exp: Date.now() + LINK_GRANT_TTL_MS }))
  );
  return `${payload}.${await sign(payload)}`;
}

/** True only for an unexpired grant minted for exactly this account. */
export async function verifyLinkGrant(token: string, accountId: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await sign(payload);
  // Constant-time compare (both strings are same-alphabet base64url)
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return false;

  try {
    const std = payload.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(atob(std)) as { aid?: string; exp?: number };
    if (typeof data.aid !== "string" || typeof data.exp !== "number") return false;
    if (data.aid !== accountId) return false;
    return data.exp > Date.now();
  } catch {
    return false;
  }
}
