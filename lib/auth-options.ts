import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { company: { select: { name: true } } },
        });
        if (!user || !user.isActive) return null;

        // Superadmin accounts never get a tenant session at all — the
        // platform console has its own cookie session, minted only at
        // /superadmin/login (password + emailed code). Generic failure so
        // this endpoint never confirms which addresses are staff.
        if (user.role === "SUPERADMIN") return null;

        // Captcha-gate the login BEFORE the password check, so password
        // validity is never revealed without a human-verified token
        // (verifyCaptcha passes when Turnstile isn't configured). Accounts
        // created moments ago skip it so the register page's auto sign-in
        // works — its Turnstile token was already consumed by the register
        // API, and an attacker who just created the account knows its
        // password anyway.
        const justRegistered = Date.now() - user.createdAt.getTime() < 2 * 60 * 1000;
        if (!justRegistered) {
          const captchaOk = await verifyCaptcha(credentials.captchaToken);
          if (!captchaOk) throw new Error("captcha");
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.companyId = (user as { companyId?: string | null }).companyId;
        token.companyName = (user as { companyName?: string | null }).companyName ?? null;
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
      session.user.role = token.role as string;
      session.user.companyId = (token.companyId as string | null) ?? null;
      session.user.companyName = (token.companyName as string | null) ?? null;
      return session;
    },
  },
  pages: {
    signIn: "/app/login",
  },
};
