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
import { APPLE_USER_COOKIE } from "@/lib/sign-in-options";

/**
 * Options are built per request so the OAuth callback can see the session
 * the visitor already holds. Two things a signed-in person can do through
 * Google or Apple besides signing in, both decided in the signIn callback
 * (lib/auth-options.ts) from the context assembled here:
 *
 * - VERIFY ("verify it's you", lib/reauth.ts): the intent cookie says a page
 *   sent them through the provider to prove they hold the login. If the
 *   identity belongs to the session's account, the callback asks for a
 *   grant and we stamp it on NextAuth's response below.
 * - LINK ("Connect Google/Apple" from Settings → My Profile): only with a
 *   fresh grant. A cookie alone is not enough — NextAuth's signin endpoint
 *   is a form POST anyone can submit, so the holder of a copied cookie could
 *   otherwise weld their own identity to the login and keep it after the
 *   victim's password reset.
 *
 * Either way the session must be a full (company) session minted after the
 * account's last password change, mirroring the eviction rule in
 * lib/permissions.ts. Anything else is a plain sign-in.
 *
 * Apple's callback arrives as a cross-site form POST, on which browsers
 * send none of our Lax cookies — no session, no PKCE verifier, no intent.
 * middleware.ts turns that POST into a 303 → same-site GET carrying the
 * same code, so by the time it reaches here every cookie is present and
 * this context is exactly as complete as it is for Google.
 */
async function requestContext(req: NextRequest): Promise<AuthRequestContext> {
  const ctx: AuthRequestContext = {
    currentAccountId: null,
    currentCompanyId: null,
    reauthVia: null,
    reauthReturnTo: null,
    appleName: parseAppleName(req.cookies.get(APPLE_USER_COOKIE)?.value),
    outcome: {},
  };

  const token = await getToken({ req, secret: process.env.AUTH_SECRET }).catch(() => null);
  const accountId = typeof token?.accountId === "string" ? token.accountId : null;
  const companyId = typeof token?.companyId === "string" ? token.companyId : null;
  if (!accountId || !companyId) return ctx;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { passwordChangedAt: true },
  });
  if (!account) return ctx;

  const authAt = typeof token?.authAt === "number" ? token.authAt : 0;
  if (account.passwordChangedAt && authAt < account.passwordChangedAt.getTime()) return ctx;

  const grant = req.cookies.get(REAUTH_COOKIE)?.value ?? "";
  const intent = req.cookies.get(REAUTH_INTENT_COOKIE)?.value ?? "";
  ctx.currentAccountId = accountId;
  ctx.currentCompanyId = companyId;
  ctx.reauthVia = grant ? await verifyReauthGrant(grant, accountId) : null;
  ctx.reauthReturnTo = intent ? await verifyReauthIntent(intent, accountId) : null;
  return ctx;
}

/**
 * Apple's `user` field: `{"name":{"firstName":"…","lastName":"…"},"email":"…"}`.
 * Only the name is wanted — the email comes from the verified token.
 */
function parseAppleName(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = JSON.parse(decodeURIComponent(raw)) as { name?: { firstName?: string; lastName?: string } };
    const name = `${u?.name?.firstName ?? ""} ${u?.name?.lastName ?? ""}`.trim();
    return name || null;
  } catch {
    return null;
  }
}

async function handler(req: NextRequest, routeCtx: { params: Promise<{ nextauth: string[] }> }) {
  const ctx = await requestContext(req);
  const res = await NextAuth(req, routeCtx, buildAuthOptions(ctx));
  // Only the provider CALLBACK leg settles a verification. The signin leg
  // (the POST that sends the browser off to the provider) passes through
  // here too, with the same intent cookie — retiring it there would strip
  // the intent before the provider ever answered, and the round-trip would
  // land as a plain sign-in with nothing verified.
  const isCallback = req.nextUrl.pathname.startsWith("/api/auth/callback/");
  const hadAppleUser = Boolean(req.cookies.get(APPLE_USER_COOKIE));
  if (!isCallback || (!ctx.reauthReturnTo && !hadAppleUser)) return res;

  // A verify round-trip ends here: stamp the grant when the provider
  // vouched for the session's own account, and retire the intent either
  // way. NextAuth's redirect response may carry immutable headers, so
  // rebuild it.
  const out = new Response(res.body, { status: res.status, headers: new Headers(res.headers) });
  if (ctx.reauthReturnTo) {
    if (ctx.outcome.reauthGranted && ctx.currentAccountId) {
      const via = req.nextUrl.pathname.endsWith("/apple") ? "apple" : "google";
      out.headers.append(
        "Set-Cookie",
        serializeReauthCookie(
          REAUTH_COOKIE,
          await createReauthGrant(ctx.currentAccountId, via),
          Math.floor(REAUTH_TTL_MS / 1000)
        )
      );
    }
    out.headers.append("Set-Cookie", serializeReauthCookie(REAUTH_INTENT_COOKIE, "", 0));
  }
  if (hadAppleUser) {
    out.headers.append("Set-Cookie", serializeReauthCookie(APPLE_USER_COOKIE, "", 0));
  }
  return out;
}

export { handler as GET, handler as POST };
