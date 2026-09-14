import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { buildAuthOptions } from "@/lib/auth-options";

/**
 * Options are built per request so the Google callback can see the session
 * the visitor already holds: "Connect Google" from Settings → My Profile
 * links the identity to THAT account instead of minting a new session.
 * Every other action (session reads, the credentials POST) is unaffected —
 * the context is only read inside the OAuth sign-in callback.
 */
async function handler(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET }).catch(() => null);
  return NextAuth(
    req,
    ctx,
    buildAuthOptions({
      currentAccountId: typeof token?.accountId === "string" ? token.accountId : null,
      currentCompanyId: typeof token?.companyId === "string" ? token.companyId : null,
    })
  );
}

export { handler as GET, handler as POST };
