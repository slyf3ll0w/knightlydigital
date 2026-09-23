import { createRemoteJWKSet, jwtVerify } from "jose";
import { APPLE_APP_BUNDLE_ID, APPLE_ISSUER } from "@/lib/apple-signin";

/**
 * Verify an Apple identity token (OIDC JWT) server-side.
 *
 * The iOS app signs in through the native Sign in with Apple sheet
 * (@capgo/capacitor-social-login) and hands us the identity token the
 * device obtained from Apple. On that path the token is the only proof of
 * identity, so it is checked exactly as Apple documents: signature against
 * their JWKS, issuer, audience and expiry. Nothing downstream reads an
 * unverified claim. (The web flow's token is verified by NextAuth itself.)
 *
 * Audience differs by surface: a token minted on the device is addressed
 * to the app's bundle id; one from the web flow to the Services ID. The
 * caller says which it expects, so a web token can never stand in for a
 * native one or vice versa.
 *
 * @see https://developer.apple.com/documentation/signinwithapple/verifying-a-user
 */

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type VerifiedAppleIdToken = {
  /** Apple's stable per-team user id — the AccountIdentity key. */
  sub: string;
  email: string | null;
  /**
   * Apple attests every address it hands out, including Hide My Email
   * relays (which forward to the real inbox). resolveSocialSignIn refuses
   * to link by email without this.
   */
  emailVerified: boolean;
  /** A @privaterelay.appleid.com address, not the person's own. */
  isPrivateEmail: boolean;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Apple serializes booleans as the strings "true"/"false" in some tokens. */
export function appleFlag(v: unknown): boolean {
  return v === true || v === "true";
}

/**
 * Null on anything suspect — bad signature, wrong audience, expired, or no
 * subject. Callers treat null as "this sign-in did not happen".
 */
export async function verifyAppleIdToken(
  idToken: string,
  surface: "app" | "web"
): Promise<VerifiedAppleIdToken | null> {
  const audience = surface === "app" ? APPLE_APP_BUNDLE_ID : process.env.APPLE_SIGNIN_SERVICES_ID;
  if (!audience || !idToken) return null;

  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience,
      clockTolerance: 60,
    });
    const sub = str(payload.sub);
    if (!sub) return null;
    return {
      sub,
      email: str(payload.email),
      emailVerified: appleFlag(payload.email_verified),
      isPrivateEmail: appleFlag(payload.is_private_email),
    };
  } catch {
    return null;
  }
}
