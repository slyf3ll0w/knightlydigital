import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildAuthOptions, type AuthRequestContext } from "@/lib/auth-options";
import {
  REAUTH_COOKIE,
  REAUTH_INTENT_COOKIE,
  REAUTH_TTL_MS,
  createReauthGrant,
  serializeReauthCookie,
  verifyReauthGrant,
  verifyReauthIntent,
} from "@/lib/reauth";

/**
 * Options are built per request so the Google callback can see the session
 * the visitor already holds. Two things a signed-in person can do through
 * Google besides signing in, both decided in the signIn callback
 * (lib/auth-options.ts) from the context assembled here:
 *
 * - VERIFY ("verify it's you", lib/reauth.ts): the intent cookie says a page
 *   sent them through Google to prove they hold the login. If the Google
 *   identity belongs to the session's account, the callback asks for a grant
 *   and we stamp it on NextAuth's response below.
 * - LINK ("Connect Google" from Settings → My Profile): only with a fresh
 *   grant. A cookie alone is not enough — NextAuth's signin endpoint is a
 *   form POST anyone can submit, so the holder of a copied cookie could
 *   otherwise weld their own Google account to the login and keep it after
 *   the victim's password reset.
 *
 * Either way the session must be a full (company) session minted after the
 * account's last password change, mirroring the eviction rule in
 * lib/permissions.ts. Anything else is a plain sign-in.
 */
async function requestContext(req: NextRequest): Promise<AuthRequestContext | null> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET }).catch(() => null);
  const accountId = typeof token?.accountId === "string" ? token.accountId : null;
  const companyId = typeof token?.companyId === "string" ? token.companyId : null;
  if (!accountId || !companyId) return null;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { passwordChangedAt: true },
  });
  if (!account) return null;

  const authAt = typeof token?.authAt === "number" ? token.authAt : 0;
  if (account.passwordChangedAt && authAt < account.passwordChangedAt.getTime()) return null;

  const grant = req.cookies.get(REAUTH_COOKIE)?.value ?? "";
  const intent = req.cookies.get(REAUTH_INTENT_COOKIE)?.value ?? "";
  return {
    currentAccountId: accountId,
    currentCompanyId: companyId,
    reauthVia: grant ? await verifyReauthGrant(grant, accountId) : null,
    reauthReturnTo: intent ? await verifyReauthIntent(intent, accountId) : null,
    outcome: {},
  };
}

async function handler(req: NextRequest, routeCtx: { params: Promise<{ nextauth: string[] }> }) {
  const ctx = await requestContext(req);
  const res = await NextAuth(req, routeCtx, buildAuthOptions(ctx));
  // Only the provider CALLBACK leg settles a verification. The signin leg
  // (the POST that sends the browser off to Google) passes through here
  // too, with the same intent cookie — retiring it there would strip the
  // intent before Google ever answered, and the round-trip would land as a
  // plain sign-in with nothing verified.
  const isCallback = req.nextUrl.pathname.startsWith("/api/auth/callback/");
  if (!ctx?.reauthReturnTo || !isCallback) return res;

  // A verify round-trip ends here: stamp the grant when Google vouched for
  // the session's own account, and retire the intent either way. NextAuth's
  // redirect response may carry immutable headers, so rebuild it.
  const out = new Response(res.body, { status: res.status, headers: new Headers(res.headers) });
  if (ctx.outcome.reauthGranted && ctx.currentAccountId) {
    out.headers.append(
      "Set-Cookie",
      serializeReauthCookie(
        REAUTH_COOKIE,
        await createReauthGrant(ctx.currentAccountId, "google"),
        Math.floor(REAUTH_TTL_MS / 1000)
      )
    );
  }
  out.headers.append("Set-Cookie", serializeReauthCookie(REAUTH_INTENT_COOKIE, "", 0));
  return out;
}

export { handler as GET, handler as POST };
