import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { verifyPasswordForUser } from "@/lib/account";
import { listIdentities, resolveSocialSignIn, unlinkIdentity, type SocialProvider } from "@/lib/social-login";
import { verifyGoogleIdToken } from "@/lib/google-id-token";

/**
 * The signed-in person's connected sign-in methods (Settings → My Profile →
 * Connected sign-ins).
 *
 * On the web, connecting is NOT done here — that's the normal OAuth
 * round-trip (signIn("google") while signed in; the callback links the
 * identity to this session's account, lib/auth-options.ts).
 *
 * In the native app there is no redirect to come back from, so POST takes the
 * ID token the shell's plugin produced and links it. Deliberately not a
 * NextAuth sign-in: a credentials provider would re-mint the JWT and could
 * land the person on a different company than the one they were looking at.
 * Connecting a sign-in method must not move you.
 */

const PROVIDERS: SocialProvider[] = ["google", "apple"];

async function accountFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { account: { select: { id: true, passwordHash: true } } },
  });
  return user?.account ?? null;
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await accountFor(actor.id);
  if (!account) return NextResponse.json({ identities: [], hasPassword: true });
  const identities = await listIdentities(account.id);
  return NextResponse.json({ identities, hasPassword: Boolean(account.passwordHash) });
}

/** DELETE ?provider=google — disconnect; refused when it's the only way in. */
export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const provider = req.nextUrl.searchParams.get("provider") as SocialProvider | null;
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unknown sign-in method." }, { status: 400 });
  }
  const account = await accountFor(actor.id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const result = await unlinkIdentity(account.id, provider);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}

/**
 * POST { provider: "google", idToken, currentPassword } — connect a sign-in
 * method from the native app. The session is untouched either way.
 *
 * The password is required whenever the login has one: linking is a way in
 * that outlives a password reset, so it takes the same proof as changing
 * the email or the password does (the web path proves it through
 * /identities/grant instead, because Google's redirect owns that request).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { provider?: string; idToken?: string; currentPassword?: string }
    | null;
  // Google is the only provider with a native path today; Apple joins it
  // when the iOS build ships (docs/plans/social-login-2026-09-14.md).
  if (body?.provider !== "google") {
    return NextResponse.json({ error: "Unknown sign-in method." }, { status: 400 });
  }
  if (!body.idToken) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const claims = await verifyGoogleIdToken(body.idToken);
  // A token that fails signature/audience/expiry is not a user error worth
  // explaining — the app just asks them to try again.
  if (!claims) {
    return NextResponse.json({ error: "Couldn't verify that Google sign-in." }, { status: 400 });
  }

  const account = await accountFor(actor.id);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.passwordHash) {
    const valid = await verifyPasswordForUser(actor.id, String(body.currentPassword ?? ""));
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  const result = await resolveSocialSignIn(
    {
      provider: "google",
      providerAccountId: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      name: claims.name,
    },
    { currentAccountId: account.id, linkIntent: true }
  );
  if (!result.ok) {
    const error =
      result.reason === "identity-taken"
        ? "That Google account is already connected to a different WorkBench login."
        : "Couldn't connect Google sign-in — please try again.";
    return NextResponse.json({ error }, { status: 400 });
  }

  const identities = await listIdentities(account.id);
  return NextResponse.json({ success: true, identities });
}
