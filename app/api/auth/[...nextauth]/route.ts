import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildAuthOptions, type AuthRequestContext } from "@/lib/auth-options";
import { LINK_GRANT_COOKIE, verifyLinkGrant } from "@/lib/link-grant";

/**
 * Options are built per request so the Google callback can see the session
 * the visitor already holds: "Connect Google" from Settings → My Profile
 * links the identity to THAT account instead of minting a new session.
 * Every other action (session reads, the credentials POST) is unaffected —
 * the context is only read inside the OAuth sign-in callback.
 */

/**
 * The session this request may link a Google identity to, or null for a
 * plain sign-in. A cookie alone is not enough: NextAuth's signin endpoint is
 * a form POST anyone can submit, so the holder of a copied cookie could
 * otherwise weld their own Google account to the login — and keep it after
 * the victim's password reset. Three checks, mirroring the eviction rule in
 * lib/permissions.ts and the password step on every other identity edit:
 *
 * 1. a full (company) session — company-less sessions are never bound to;
 * 2. minted after the account's last password change (`authAt`);
 * 3. a live link grant for this account (lib/link-grant.ts), which only the
 *    password re-entry on the profile page can mint. Password-less logins
 *    have nothing to re-enter, so the session carries them.
 */
async function linkContext(req: NextRequest): Promise<AuthRequestContext | null> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET }).catch(() => null);
  const accountId = typeof token?.accountId === "string" ? token.accountId : null;
  const companyId = typeof token?.companyId === "string" ? token.companyId : null;
  if (!accountId || !companyId) return null;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { passwordHash: true, passwordChangedAt: true },
  });
  if (!account) return null;

  const authAt = typeof token?.authAt === "number" ? token.authAt : 0;
  if (account.passwordChangedAt && authAt < account.passwordChangedAt.getTime()) return null;

  if (account.passwordHash) {
    const grant = req.cookies.get(LINK_GRANT_COOKIE)?.value ?? "";
    if (!grant || !(await verifyLinkGrant(grant, accountId))) return null;
  }

  return { currentAccountId: accountId, currentCompanyId: companyId };
}

async function handler(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  return NextAuth(req, ctx, buildAuthOptions(await linkContext(req)));
}

export { handler as GET, handler as POST };
