import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { normalizeEmail } from "@/lib/user-email";
import { findOrAdoptAccountByEmail } from "@/lib/account";

/**
 * Sessions authenticate an Account (one per email) but always point at ONE
 * User row — the active company membership. Switching companies re-points
 * the JWT at a sibling row via the "update" trigger below; nothing downstream
 * (loadActor, company scoping) has to know more than one membership exists.
 */

/** Memberships an account may hold a tenant session as. */
function eligibleRowsFor(accountId: string) {
  return prisma.user.findMany({
    where: { accountId, isActive: true, role: { not: "SUPERADMIN" } },
    orderBy: { createdAt: "asc" },
    include: { company: { select: { name: true } } },
  });
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
        captchaToken: { label: "Captcha" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Case-insensitive: whatever casing they type must reach the same
        // account the address was registered with (see lib/user-email.ts).
        // Pre-Account rows get their Account created here on the fly.
        const email = normalizeEmail(credentials.email);
        if (!email) return null;
        const account = await findOrAdoptAccountByEmail(email);
        if (!account) return null;

        // Superadmin rows never get a tenant session at all — the platform
        // console has its own cookie session, minted only at /superadmin/login
        // (password + emailed code). Generic failure so this endpoint never
        // confirms which addresses are staff. An account whose only
        // memberships are superadmin (or deactivated) fails the same way.
        const rows = await eligibleRowsFor(account.id);
        if (rows.length === 0) return null;

        // Land where they last worked; oldest membership otherwise.
        const user = rows.find((r) => r.id === account.lastActiveUserId) ?? rows[0];

        // Captcha-gate the login BEFORE the password check, so password
        // validity is never revealed without a human-verified token
        // (verifyCaptcha passes when Turnstile isn't configured). Accounts
        // created moments ago skip it so the register page's auto sign-in
        // works — its Turnstile token was already consumed by the register
        // API, and an attacker who just created the account knows its
        // password anyway.
        const justRegistered = Date.now() - account.createdAt.getTime() < 2 * 60 * 1000;
        if (!justRegistered) {
          const captchaOk = await verifyCaptcha(credentials.captchaToken, "login");
          if (!captchaOk) throw new Error("captcha");
        }

        const valid = await bcrypt.compare(credentials.password, account.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          accountId: account.id,
          email: account.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company?.name ?? null,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.accountId = (user as { accountId?: string | null }).accountId ?? null;
        token.role = (user as { role?: string }).role;
        token.companyId = (user as { companyId?: string | null }).companyId;
        token.companyName = (user as { companyName?: string | null }).companyName ?? null;
      }

      // Company switch: the client calls useSession().update({ switchToUserId })
      // and we re-point the session at a sibling membership — but only one that
      // provably belongs to this account. Anything else leaves the token as-is.
      const switchToUserId =
        trigger === "update" && session && typeof session === "object"
          ? (session as { switchToUserId?: unknown }).switchToUserId
          : undefined;
      if (typeof switchToUserId === "string" && switchToUserId && token.id) {
        // Sessions minted before multi-company shipped carry no accountId.
        if (!token.accountId) {
          const current = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { accountId: true },
          });
          token.accountId = current?.accountId ?? null;
        }
        if (token.accountId) {
          const target = await prisma.user.findFirst({
            where: {
              id: switchToUserId,
              accountId: token.accountId as string,
              isActive: true,
              role: { not: "SUPERADMIN" },
            },
            include: { company: { select: { name: true } } },
          });
          if (target) {
            token.id = target.id;
            token.role = target.role;
            token.companyId = target.companyId;
            token.companyName = target.company?.name ?? null;
            // Next sign-in lands here too. Best effort — the switch itself
            // already happened in the token.
            await prisma.account
              .update({
                where: { id: token.accountId as string },
                data: { lastActiveUserId: target.id },
              })
              .catch(() => {});
          }
        }
      }

      // Users registered before signing in get their company on next token refresh
      if (token.companyId && !token.companyName) {
        const company = await prisma.company.findUnique({
          where: { id: token.companyId as string },
          select: { name: true },
        });
        token.companyName = company?.name ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.accountId = (token.accountId as string | null) ?? null;
      session.user.role = token.role as string;
      session.user.companyId = (token.companyId as string | null) ?? null;
      session.user.companyName = (token.companyName as string | null) ?? null;
      return session;
    },
  },
  pages: {
    signIn: "/app/login",
    // The login form is a native POST to the credentials callback (so the
    // browser witnesses a real submission and offers to save the password).
    // Errors thrown from authorize (e.g. "captcha") redirect to the error
    // page — send them back to the login form, which reads ?error=.
    error: "/app/login",
  },
};
