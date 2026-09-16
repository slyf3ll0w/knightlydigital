import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verify a Google ID token (OIDC JWT) server-side.
 *
 * The native shell signs in through a Capacitor plugin instead of the web
 * OAuth redirect (Google refuses embedded webviews), so the app hands us a
 * token the device obtained directly from Google. That token is the only
 * proof of identity on that path, so it is verified here exactly as Google
 * documents: signature against their published JWKS, issuer, audience and
 * expiry. Nothing downstream reads an unverified claim.
 *
 * Audience is GOOGLE_SIGNIN_CLIENT_ID — the *web* client. Android's
 * Credential Manager is initialized with that value as its server client id,
 * so the token it mints is addressed to our backend, not to the Android
 * client. Same audience as the web redirect flow, hence no extra env var.
 *
 * @see https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */

/** Google rotates these keys; jose caches the set and refetches on a miss. */
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Google issues with both spellings; either is legitimate. */
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type VerifiedGoogleIdToken = {
  /** OIDC subject — the stable per-account id AccountIdentity is keyed on. */
  sub: string;
  email: string | null;
  /** Google's own attestation. resolveSocialSignIn refuses to link without it. */
  emailVerified: boolean;
  name: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Null on anything suspect — bad signature, wrong audience, expired, or no
 * subject. Callers treat null as "this sign-in did not happen"; the reason is
 * deliberately not returned, because none of them are the user's to fix.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdToken | null> {
  const audience = process.env.GOOGLE_SIGNIN_CLIENT_ID;
  if (!audience || !idToken) return null;

  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ISSUERS,
      audience,
      // Google ID tokens are short-lived (1h); jose enforces exp itself.
      clockTolerance: 60,
    });

    const sub = str(payload.sub);
    if (!sub) return null;

    return {
      sub,
      email: str(payload.email),
      // The claim arrives as a boolean from Google, but has historically been
      // serialized as the string "true" by some clients — accept both, and
      // nothing else.
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
      name: str(payload.name),
    };
  } catch {
    return null;
  }
}
