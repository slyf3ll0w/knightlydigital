import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { verifyPasswordForUser } from "@/lib/account";
import { verifyGoogleIdToken } from "@/lib/google-id-token";
import { identityAccountId } from "@/lib/social-login";
import {
  REAUTH_COOKIE,
  REAUTH_INTENT_COOKIE,
  createReauthGrant,
  createReauthIntent,
  freshReauth,
  isSafeReturnTo,
  reauthCookieOptions,
} from "@/lib/reauth";

/**
 * "Verify it's you" (lib/reauth.ts).
 *
 * GET  → what this login can verify with, and whether it already has.
 * POST → prove it, one of:
 *   { method: "password", currentPassword }          — mints the grant
 *   { method: "google", idToken }                    — native app: the shell's
 *                                                      Google sheet produced
 *                                                      an ID token; it must
 *                                                      belong to THIS login
 *   { method: "google", start: true, returnTo }      — web: remember the wish,
 *                                                      then the page sends the
 *                                                      browser through Google;
 *                                                      the OAuth callback mints
 *                                                      the grant on the way back
 * DELETE → drop the grant early ("lock").
 *
 * Rate-limited by middleware (the password branch is a guessing surface).
 */

async function loginFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      account: {
        select: { id: true, passwordHash: true, identities: { select: { provider: true } } },
      },
    },
  });
  return user?.account ?? null;
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await loginFor(actor.id);
  if (!account) {
    return NextResponse.json({ fresh: null, hasPassword: true, google: false, apple: false });
  }
  const providers = new Set(account.identities.map((i) => i.provider));
  return NextResponse.json({
    fresh: await freshReauth(account.id),
    hasPassword: Boolean(account.passwordHash),
    google: providers.has("google"),
    apple: providers.has("apple"),
  });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await loginFor(actor.id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as
    | { method?: string; currentPassword?: string; idToken?: string; start?: boolean; returnTo?: string }
    | null;

  if (body?.method === "password") {
    if (!account.passwordHash) {
      return NextResponse.json({ error: "This login has no password yet." }, { status: 400 });
    }
    const valid = await verifyPasswordForUser(actor.id, String(body.currentPassword ?? ""));
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
    const res = NextResponse.json({ success: true, via: "password" });
    res.cookies.set(REAUTH_COOKIE, await createReauthGrant(account.id, "password"), reauthCookieOptions());
    return res;
  }

  if (body?.method === "google" && body.start) {
    const returnTo = isSafeReturnTo(body.returnTo) ? body.returnTo : "/app/settings/profile";
    const res = NextResponse.json({ success: true, returnTo });
    res.cookies.set(REAUTH_INTENT_COOKIE, await createReauthIntent(account.id, returnTo), reauthCookieOptions());
    return res;
  }

  if (body?.method === "google") {
    if (!body.idToken) return NextResponse.json({ error: "Missing token." }, { status: 400 });
    const claims = await verifyGoogleIdToken(body.idToken);
    if (!claims) {
      return NextResponse.json({ error: "Couldn't verify that Google sign-in." }, { status: 400 });
    }
    // The proof is only good if that Google account opens THIS login.
    const owner = await identityAccountId("google", claims.sub);
    if (owner !== account.id) {
      return NextResponse.json(
        { error: "That Google account isn't connected to this login.", code: "wrong-account" },
        { status: 400 }
      );
    }
    const res = NextResponse.json({ success: true, via: "google" });
    res.cookies.set(REAUTH_COOKIE, await createReauthGrant(account.id, "google"), reauthCookieOptions());
    return res;
  }

  return NextResponse.json({ error: "Unknown verification method." }, { status: 400 });
}

export async function DELETE() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = NextResponse.json({ success: true });
  res.cookies.set(REAUTH_COOKIE, "", reauthCookieOptions(0));
  res.cookies.set(REAUTH_INTENT_COOKIE, "", reauthCookieOptions(0));
  return res;
}
