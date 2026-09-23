import { createPrivateKey, sign as cryptoSign, type KeyObject } from "crypto";

/**
 * Sign in with Apple — the server-side constants and the client secret.
 *
 * Apple has no static client secret: the "secret" is a JWT the app signs
 * with a private key from the developer portal (ES256), good for at most
 * six months. Minting it at boot from env — and again when it nears expiry
 * — is what stops the six-month cliff from ever taking sign-in down.
 *
 * Env (all from developer.apple.com, docs/plans/native-release-queue.md):
 *   APPLE_TEAM_ID                — already set for the Associated Domains file
 *   APPLE_SIGNIN_SERVICES_ID     — the Services ID = the web client id
 *   APPLE_SIGNIN_KEY_ID          — the 10-character key id
 *   APPLE_SIGNIN_PRIVATE_KEY     — the .p8 contents, PEM (literal "\n" or
 *                                  base64 of the whole file both accepted)
 *
 * Node crypto rather than jose because NextAuth's options are assembled
 * synchronously per request (lib/auth-options.ts).
 */

/** The iOS app's bundle id — the audience of a native Apple identity token. */
export const APPLE_APP_BUNDLE_ID = "com.streamflaire.hub";

export const APPLE_ISSUER = "https://appleid.apple.com";

/** Apple caps the secret at 6 months; renew with a day to spare. */
const SECRET_TTL_S = 150 * 24 * 60 * 60;
const RENEW_BEFORE_S = 24 * 60 * 60;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function privateKeyPem(): string {
  const raw = (process.env.APPLE_SIGNIN_PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("APPLE_SIGNIN_PRIVATE_KEY is not set");
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  // base64 of the whole .p8 file — the easiest way to paste it into Railway.
  return Buffer.from(raw, "base64").toString("utf8");
}

let key: KeyObject | null = null;
let cached: { secret: string; exp: number } | null = null;

/**
 * The client secret Apple's token endpoint expects: an ES256 JWT with the
 * team as issuer, the Services ID as subject and Apple as audience.
 */
export function appleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - now > RENEW_BEFORE_S) return cached.secret;

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_SIGNIN_KEY_ID;
  const clientId = process.env.APPLE_SIGNIN_SERVICES_ID;
  if (!teamId || !keyId || !clientId) throw new Error("Sign in with Apple is not configured");

  key ??= createPrivateKey({ key: privateKeyPem(), format: "pem" });

  const exp = now + SECRET_TTL_S;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now, exp, aud: APPLE_ISSUER, sub: clientId }));
  const signingInput = `${header}.${payload}`;
  // JOSE wants the raw r||s signature, not DER — ieee-p1363 is exactly that.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  cached = { secret: `${signingInput}.${b64url(signature)}`, exp };
  return cached.secret;
}
