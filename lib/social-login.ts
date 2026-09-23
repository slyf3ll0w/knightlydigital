import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/user-email";
import { eligibleMembershipsFor, findOrAdoptAccountByEmail, pickMembership } from "@/lib/account";
import { sendEmail, signInMethodLinkedEmail } from "@/lib/email";

/**
 * Third-party sign-in (Google today, Apple next) on top of the Account model.
 *
 * One rule set, whichever surface the identity token came from — the web
 * OAuth redirect (NextAuth's Google provider) or, later, the native shell's
 * sign-in plugin posting an ID token. Every path ends in resolveSocialSignIn:
 *
 *   1. Known identity (provider + subject id)  → that Account.
 *   2. Unknown identity, LINK intent           → the signed-in caller's Account
 *                                                (Settings → My Profile only).
 *   3. Unknown identity, verified email match  → link it to that Account.
 *   4. Unknown identity, nobody home           → open a password-less Account.
 *
 * Step 2 needs the caller to have asked for a link; a plain sign-in never
 * binds to whatever session the browser happens to hold. (A sign-up that
 * comes back through the login page is a KNOWN identity — step 1 covers it.
 * Without the intent check, a second person tapping Google on a shared
 * computer would weld their Google account to the first person's login.)
 *
 * Step 3 is the only email-based match and it requires the provider to vouch
 * the address is verified; an unverified address never links to anything (an
 * attacker who registers victim@company.com at a lax provider must not walk
 * into the victim's login). After that the subject id is the key — a person
 * changing their Google address doesn't lose their WorkBench login.
 */

export type SocialProvider = "google" | "apple";

export const PROVIDER_LABEL: Record<SocialProvider, string> = {
  google: "Google",
  apple: "Apple",
};

export type SocialProfile = {
  provider: SocialProvider;
  /** The provider's stable subject id (OIDC `sub`). */
  providerAccountId: string;
  email: string | null | undefined;
  emailVerified: boolean;
  name: string | null | undefined;
};

export type SocialSignInUser = {
  id: string;
  accountId: string;
  email: string;
  name: string;
  role: string;
  companyId: string | null;
  companyName: string | null;
};

export type SocialRejection =
  /** Provider gave no address, so a brand-new account can't be keyed. */
  | "no-email"
  /** Provider address isn't verified — refused rather than trusted. */
  | "unverified-email"
  /** The account's only memberships are platform staff (superadmin console). */
  | "staff-only"
  /** Link intent, but this identity already belongs to a different Account. */
  | "identity-taken";

export type SocialSignInResult =
  | { ok: true; user: SocialSignInUser; outcome: "existing" | "linked" | "created" }
  | { ok: false; reason: SocialRejection };

export type SocialSignInContext = {
  /** The Account behind the session the caller already holds, if any. */
  currentAccountId?: string | null;
  /**
   * True when the caller is linking from inside the app (Settings → My
   * Profile) rather than signing in: an identity that belongs to someone
   * else is then an error, not a switch of accounts.
   */
  linkIntent?: boolean;
};

const identityKey = (p: SocialProfile) => ({
  provider_providerAccountId: { provider: p.provider, providerAccountId: p.providerAccountId },
});

function displayName(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n.slice(0, 100);
  const local = email.split("@")[0] ?? "";
  return local ? local.slice(0, 100) : "New user";
}

/**
 * Resolve (and if needed create) the Account + membership a social identity
 * signs in as. Never throws for expected outcomes — every refusal is a
 * reason the login page can explain.
 */
export async function resolveSocialSignIn(
  profile: SocialProfile,
  ctx: SocialSignInContext = {}
): Promise<SocialSignInResult> {
  const email = normalizeEmail(profile.email ?? "");

  let accountId: string | null = null;
  let outcome: "existing" | "linked" | "created" = "existing";

  const identity = await prisma.accountIdentity.findUnique({
    where: identityKey(profile),
    select: { id: true, accountId: true },
  });

  if (identity && ctx.linkIntent && ctx.currentAccountId && identity.accountId !== ctx.currentAccountId) {
    // The identity already opens another login. Usually that's a refusal —
    // except when the other login is an empty shell this very identity
    // created: someone whose Apple ID hides their email (a private relay
    // that matches no owner-added teammate) taps Sign in with Apple, lands
    // in a brand-new company-less account, then follows the "already have a
    // login?" pointer, signs in with their password and connects Apple from
    // Settings. Moving the identity here is what makes that path end well;
    // the shell had nothing in it but this one row.
    const moved = await adoptPlaceholderIdentity(identity.id, identity.accountId, ctx.currentAccountId);
    if (!moved) return { ok: false, reason: "identity-taken" };
    accountId = ctx.currentAccountId;
    outcome = "linked";
  } else if (identity) {
    accountId = identity.accountId;
    await prisma.accountIdentity
      .update({ where: { id: identity.id }, data: { lastUsedAt: new Date(), email: email || undefined } })
      .catch(() => {});
  } else if (ctx.linkIntent && ctx.currentAccountId) {
    // "Connect Google" from inside the app: the identity joins THEIR account.
    accountId = ctx.currentAccountId;
    outcome = "linked";
  } else {
    if (!email) return { ok: false, reason: "no-email" };
    if (!profile.emailVerified) return { ok: false, reason: "unverified-email" };
    const existing = await findOrAdoptAccountByEmail(email);
    if (existing) {
      accountId = existing.id;
      outcome = "linked";
    } else {
      try {
        const created = await prisma.account.create({
          data: { email, passwordHash: null },
          select: { id: true },
        });
        accountId = created.id;
        outcome = "created";
      } catch (e) {
        // Lost a create race on Account.email — the winner's row is the account.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        const winner = await prisma.account.findUnique({ where: { email }, select: { id: true } });
        if (!winner) throw e;
        accountId = winner.id;
        outcome = "linked";
      }
    }
  }

  // A moved identity is already bound — nothing to create.
  const alreadyBound = Boolean(identity) && outcome === "linked";
  if (outcome !== "existing" && !alreadyBound) {
    try {
      await prisma.accountIdentity.create({
        data: {
          accountId,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email: email || null,
          lastUsedAt: new Date(),
        },
      });
    } catch (e) {
      // Same identity created concurrently — whoever won, it's bound now;
      // re-resolve so we honor the row that actually exists.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      const bound = await prisma.accountIdentity.findUnique({
        where: identityKey(profile),
        select: { accountId: true },
      });
      if (!bound) throw e;
      if (bound.accountId !== accountId) {
        if (ctx.linkIntent) return { ok: false, reason: "identity-taken" };
        accountId = bound.accountId;
      }
      outcome = "existing";
    }
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, email: true, lastActiveUserId: true },
  });
  if (!account) return { ok: false, reason: "identity-taken" };

  // Someone else's login just gained a new way in — tell the inbox that owns
  // it. Brand-new accounts don't need the notice (there's nobody to warn).
  if (outcome === "linked") {
    const notice = signInMethodLinkedEmail({
      provider: PROVIDER_LABEL[profile.provider],
      providerEmail: email || null,
    });
    sendEmail({ to: account.email, ...notice }).catch(() => {});
  }

  let rows = await eligibleMembershipsFor(account.id);
  if (rows.length === 0) {
    // Staff accounts never get a tenant session — same generic refusal as
    // the password path, so this endpoint never confirms who is staff.
    const staff = await prisma.user.findFirst({
      where: { accountId: account.id, role: "SUPERADMIN" },
      select: { id: true },
    });
    if (staff) return { ok: false, reason: "staff-only" };

    // Nobody home yet: a company-less membership row carries the session
    // until they open their business (middleware routes it to /app/register;
    // /apply adopts the row as the new company's OWNER — lib/signup.ts).
    await prisma.user.create({
      data: {
        email: account.email,
        name: displayName(profile.name, account.email),
        accountId: account.id,
        role: "OWNER",
        companyId: null,
      },
    });
    rows = await eligibleMembershipsFor(account.id);
  }

  const user = pickMembership(rows, account.lastActiveUserId);
  if (!user) return { ok: false, reason: "staff-only" };

  return {
    ok: true,
    outcome,
    user: {
      id: user.id,
      accountId: account.id,
      email: account.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company?.name ?? null,
    },
  };
}

/**
 * Move an identity off a placeholder account onto the caller's, and delete
 * the placeholder. Only when the other account is provably empty: no
 * password, no other sign-in method, and no membership in any company
 * (its rows are the company-less stubs a social sign-up leaves behind).
 * Anything more and it is somebody's login — refused.
 */
async function adoptPlaceholderIdentity(
  identityId: string,
  fromAccountId: string,
  toAccountId: string
): Promise<boolean> {
  const other = await prisma.account.findUnique({
    where: { id: fromAccountId },
    select: {
      passwordHash: true,
      identities: { select: { id: true } },
      users: { select: { id: true, companyId: true } },
    },
  });
  if (!other) return false;
  const empty =
    !other.passwordHash &&
    other.identities.length === 1 &&
    other.identities[0]?.id === identityId &&
    other.users.every((u) => u.companyId === null);
  if (!empty) return false;

  await prisma.$transaction([
    prisma.accountIdentity.update({
      where: { id: identityId },
      data: { accountId: toAccountId, lastUsedAt: new Date() },
    }),
    prisma.user.deleteMany({ where: { accountId: fromAccountId, companyId: null } }),
    prisma.account.delete({ where: { id: fromAccountId } }),
  ]);
  return true;
}

/** The sign-in methods on an account, for the Connected sign-ins card. */
export async function listIdentities(accountId: string) {
  return prisma.accountIdentity.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    select: { provider: true, email: true, createdAt: true, lastUsedAt: true },
  });
}

/**
 * Remove a sign-in method. Refused when it's the account's only way in (no
 * password and no other identity) — that would lock the person out.
 */
export async function unlinkIdentity(
  accountId: string,
  provider: SocialProvider
): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { passwordHash: true, identities: { select: { provider: true } } },
  });
  if (!account) return { ok: false, error: "Account not found." };
  const others = account.identities.filter((i) => i.provider !== provider);
  if (!account.passwordHash && others.length === 0) {
    return {
      ok: false,
      error: `${PROVIDER_LABEL[provider]} is the only way into this account. Set a password first (use "Forgot password" on the login page), then disconnect it.`,
    };
  }
  await prisma.accountIdentity.deleteMany({ where: { accountId, provider } });
  return { ok: true };
}

/**
 * Which Account a provider identity opens, if any — the check behind
 * "verify it's you with Google": a fresh Google sign-in only counts as proof
 * when that Google account is connected to the login being verified.
 */
export async function identityAccountId(
  provider: SocialProvider,
  providerAccountId: string
): Promise<string | null> {
  const row = await prisma.accountIdentity.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { accountId: true },
  });
  return row?.accountId ?? null;
}
