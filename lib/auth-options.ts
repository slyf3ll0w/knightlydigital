import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyCaptcha } from "@/lib/captcha";
import { normalizeEmail } from "@/lib/user-email";
import { eligibleMembershipsFor, findOrAdoptAccountByEmail, pickMembership } from "@/lib/account";
import { isGoogleSignInConfigured } from "@/lib/sign-in-options";
import { verifyGoogleIdToken } from "@/lib/google-id-token";
import { identityAccountId, resolveSocialSignIn, type SocialSignInUser } from "@/lib/social-login";
import type { ReauthVia } from "@/lib/reauth";

/**
 * Sessions authenticate an Account (one per email) but always point at ONE
 * User row — the active company membership. Switching companies re-points
 * the JWT at a sibling row via the "update" trigger below; nothing downstream
 * (loadActor, company scoping) has to know more than one membership exists.
 *
 * Three ways to prove you own an Account: the password (Credentials provider,
 * a native form POST so password managers see it), a Google sign-in on the
 * web (OAuth redirect) and a Google sign-in in the Android app (the shell's
 * plugin hands us an ID token, verified here). All three land in
 * lib/social-login.ts, which binds the Google subject id to the Account, and
 * all three mint the same JWT shape.
 */

/**
 * What the OAuth callback knows about the session the visitor already holds
 * (assembled per request in app/api/auth/[...nextauth]/route.ts).
 */
export type AuthRequestContext = {
  currentAccountId: string | null;
  currentCompanyId: string | null;
  /** A fresh "verify it's you" proof for that account, if the request carries one. */
  reauthVia: ReauthVia | null;
  /** Set when this Google round-trip IS the verification: the page to return to. */
  reauthReturnTo: string | null;
  /** Written by the callback for the route handler to act on. */
  outcome: { reauthGranted?: boolean };
};

/** Google's OIDC profile — the fields the sign-in rules read. */
type GoogleProfile = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * The options, bound to one request. Only the OAuth sign-in callback reads
 * the context (to link a Google identity to the account already signed in);
 * every other caller — getServerSession, loadActor — uses `authOptions`.
 */
export function buildAuthOptions(ctx: AuthRequestContext | null = null): NextAuthOptions {
  return {
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

          // Superadmin rows never get a tenant session at all — the platform
          // console has its own cookie session, minted only at /superadmin/login
          // (password + emailed code). Generic failure so this endpoint never
          // confirms which addresses are staff. An account whose only
          // memberships are superadmin (or deactivated) fails the same way.
          const rows = account ? await eligibleMembershipsFor(account.id) : [];
          const user = account ? pickMembership(rows, account.lastActiveUserId) : null;

          // Captcha-gate the login BEFORE any verdict on the address — the
          // unknown-email and known-email paths must fail identically, or
          // the captcha error alone tells a prober which addresses exist.
          // (verifyCaptcha passes when Turnstile isn't configured.) Sign-ups
          // from moments ago skip it so the signup pages' auto sign-in works:
          // their Turnstile token was already consumed by the signup API, and
          // whoever just created the account (or just attached a new company
          // to an existing login — a fresh membership row) knows its password
          // anyway.
          const fresh = (d: Date) => Date.now() - d.getTime() < 2 * 60 * 1000;
          const justRegistered = Boolean(
            account && (fresh(account.createdAt) || (user && fresh(user.createdAt)))
          );
          if (!justRegistered) {
            const captchaOk = await verifyCaptcha(credentials.captchaToken, "login");
            if (!captchaOk) throw new Error("captcha");
          }
          if (!account || !user) return null;

          // No hash = a social-only account. Same generic failure: the form
          // must not reveal that the address exists but has no password.
          if (!account.passwordHash) return null;
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
      // Feature-flagged by env: with no client the provider isn't listed, so
      // /api/auth/providers and the sign-in buttons stay password-only.
      ...(isGoogleSignInConfigured()
        ? [
            GoogleProvider({
              clientId: process.env.GOOGLE_SIGNIN_CLIENT_ID!,
              clientSecret: process.env.GOOGLE_SIGNIN_CLIENT_SECRET!,
              authorization: {
                // Always offer the account chooser — people with a work and a
                // personal Google account must be able to pick, every time.
                params: { prompt: "select_account", scope: "openid email profile" },
              },
            }),
          ]
        : []),
      // The Android shell's path. Google refuses OAuth inside an embedded
      // webview, so the app signs in through the native Credential Manager
      // (@capgo/capacitor-social-login) and posts the resulting ID token
      // here. Credentials-shaped because there is no redirect to run — but
      // the token is verified against Google's JWKS before it means anything,
      // and then the SAME rules as the web path decide the account.
      ...(isGoogleSignInConfigured()
        ? [
            CredentialsProvider({
              id: "google-native",
              name: "Google",
              credentials: { idToken: { label: "Google ID token" } },
              async authorize(credentials) {
                const idToken = credentials?.idToken;
                if (!idToken) return null;

                // Signature, issuer, audience, expiry. Null = never happened.
                const claims = await verifyGoogleIdToken(idToken);
                if (!claims) return null;

                // No linkIntent: connecting an identity to the account you
                // are already signed into goes through
                // POST /api/app/profile/identities, which leaves the session
                // alone. This is a plain sign-in: the Google identity decides
                // the account (a sign-up coming back through the login page
                // is a known identity — rule 1), never the session held.
                const result = await resolveSocialSignIn(
                  {
                    provider: "google",
                    providerAccountId: claims.sub,
                    email: claims.email,
                    emailVerified: claims.emailVerified,
                    name: claims.name,
                  },
                  { currentAccountId: ctx?.currentAccountId ?? null, linkIntent: false }
                );

                // Thrown reasons reach the client as signIn()'s `error`, so
                // the app shows the same copy as the web ?error= codes.
                if (!result.ok) throw new Error(result.reason);
                return result.user satisfies SocialSignInUser;
              },
            }),
          ]
        : []),
    ],
    session: {
      strategy: "jwt",
      // Two weeks, rolled forward on use (NextAuth's default is 30 days with no
      // revocation — long for an app that holds payment data).
      maxAge: 14 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    callbacks: {
      // OAuth sign-ins land here with the provider's profile; the password
      // path (authorize above) has already decided by now and passes through.
      async signIn({ user, account, profile }) {
        if (!account || account.type === "credentials") return true;
        if (account.provider !== "google") return false;

        const p = (profile ?? {}) as GoogleProfile;
        const sub = isNonEmptyString(account.providerAccountId)
          ? account.providerAccountId
          : isNonEmptyString(p.sub)
            ? p.sub
            : null;
        if (!sub) return false;

        // "Verify it's you" through Google: a page sent a signed-in person
        // here to prove they hold the login. It only counts when this Google
        // account is already connected to the session's own account; the
        // session is never re-minted or switched, they just go back.
        if (ctx?.reauthReturnTo && ctx.currentAccountId) {
          const owner = await identityAccountId("google", sub);
          const sep = ctx.reauthReturnTo.includes("?") ? "&" : "?";
          if (owner && owner === ctx.currentAccountId) {
            ctx.outcome.reauthGranted = true;
            return `${ctx.reauthReturnTo}${sep}reauth=ok`;
          }
          return `${ctx.reauthReturnTo}${sep}reauth=wrong-account`;
        }

        // Linking from Settings → My Profile means a full (company) session
        // that just verified itself (password, or a connected provider);
        // anything else (signed out, a company-less session bouncing through
        // the login page, or a session with no fresh proof) is a plain
        // sign-in, decided by the Google identity alone — the session held is
        // never bound to.
        const linkIntent = Boolean(ctx?.currentAccountId && ctx?.currentCompanyId && ctx?.reauthVia);
        const result = await resolveSocialSignIn(
          {
            provider: "google",
            providerAccountId: sub,
            email: p.email,
            emailVerified: p.email_verified === true,
            name: p.name,
          },
          { currentAccountId: ctx?.currentAccountId ?? null, linkIntent }
        );

        if (!result.ok) {
          return linkIntent
            ? `/app/settings/profile?link-error=${result.reason}`
            : `/app/login?error=${result.reason}`;
        }

        // A link from inside the app keeps the session exactly where it is —
        // no re-minting onto whatever membership the resolver picked.
        if (linkIntent) {
          return "/app/settings/profile?linked=google";
        }

        // NextAuth hands this same object to jwt() below — the membership
        // fields ride along on it, replacing Google's profile-shaped stub.
        Object.assign(user, result.user satisfies SocialSignInUser);
        return true;
      },
      async jwt({ token, user, account, trigger, session }) {
        if (user) {
          token.id = user.id;
          // When this session was minted. loadActor compares it with the
          // account's passwordChangedAt so a password reset evicts every
          // session that predates it — including an attacker's.
          token.authAt = Date.now();
          token.accountId = (user as { accountId?: string | null }).accountId ?? null;
          token.role = (user as { role?: string }).role;
          token.companyId = (user as { companyId?: string | null }).companyId;
          token.companyName = (user as { companyName?: string | null }).companyName ?? null;
          token.signInMethod =
            account?.provider === "google" || account?.provider === "google-native"
              ? "google"
              : "password";
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

        // A company-less session (social sign-up that hasn't opened its
        // business yet) re-checks on every read whether a company appeared —
        // /apply adopts the row in place, so the same id now has a company,
        // or a teammate's add may have created a membership. Cheap, and only
        // ever runs for the handful of sessions in that state.
        if (!token.companyId && token.id) {
          const own = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { companyId: true, role: true, accountId: true, company: { select: { name: true } } },
          });
          if (own?.companyId) {
            token.role = own.role;
            token.companyId = own.companyId;
            token.companyName = own.company?.name ?? null;
          } else if (own?.accountId) {
            const rows = await eligibleMembershipsFor(own.accountId);
            const withCompany = rows.find((r) => r.companyId);
            if (withCompany) {
              token.id = withCompany.id;
              token.role = withCompany.role;
              token.companyId = withCompany.companyId;
              token.companyName = withCompany.company?.name ?? null;
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
        // Sessions minted before authAt existed carry 0: they stay valid until
        // the account's password changes, then fall out like any other.
        session.user.authAt = typeof token.authAt === "number" ? token.authAt : 0;
        session.user.signInMethod = token.signInMethod === "google" ? "google" : "password";
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
}

/** Request-agnostic options — session reads everywhere in the app. */
export const authOptions: NextAuthOptions = buildAuthOptions();
