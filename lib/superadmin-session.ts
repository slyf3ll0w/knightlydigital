/**
 * The platform console's own session: an HMAC-signed token in its own cookie,
 * fully separate from the tenant NextAuth session — staff can be signed into
 * the console and a company account in the same browser at once. Minted by
 * POST /api/superadmin/session (after password + emailed code), verified here
 * by both middleware (edge) and lib/superadmin.ts (node), so everything uses
 * Web Crypto — no node:crypto, no prisma.
 */

export const SUPERADMIN_COOKIE = "wb-superadmin";
export const SUPERADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // a working day

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
    // Prefixed so this key usage can never collide with NextAuth's use of the secret
    new TextEncoder().encode(`wb-superadmin-session:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}

export async function createSuperadminSessionToken(userId: string): Promise<string> {
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ uid: userId, exp: Date.now() + SUPERADMIN_SESSION_TTL_MS })
    )
  );
  return `${payload}.${await sign(payload)}`;
}

/** Returns the userId for a valid, unexpired token; null otherwise. */
export async function verifySuperadminSessionToken(token: string): Promise<string | null> {
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
    const data = JSON.parse(atob(std)) as { uid?: string; exp?: number };
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}
