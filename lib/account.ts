import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { emailWhere, normalizeEmail } from "@/lib/user-email";

/**
 * One login, many companies.
 *
 * An Account is the login identity (email + password); each company
 * membership stays a full User row, so every companyId-scoped relation in the
 * app (assignments, time entries, chat, costing…) keeps working untouched.
 * The session always points at one User row — the active company.
 *
 * Identity (name, phone, avatar, email) is account-level but stored
 * DENORMALIZED on every member row, because the whole app reads user.name /
 * user.email in hundreds of places. Writes fan out here instead.
 *
 * Passwords: Account.passwordHash is authoritative. User.passwordHash is the
 * legacy pre-Account hash, honored only until the row gets an Account
 * (backfill script or lazy adoption below), and cleared on password change.
 */

type LinkableUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  accountId: string | null;
};

/**
 * Create/link the Account for a legacy User row, adopting every row that
 * shares the address (case-insensitive) so all of that person's memberships
 * hang off one login. Idempotent; race-safe via the unique on Account.email.
 */
export async function ensureAccountForUser(user: LinkableUser) {
  if (user.accountId) {
    return prisma.account.findUnique({ where: { id: user.accountId } });
  }
  const email = normalizeEmail(user.email);
  if (!email || !user.passwordHash) return null;

  let account = await prisma.account.findUnique({ where: { email } });
  if (!account) {
    try {
      account = await prisma.account.create({
        data: { email, passwordHash: user.passwordHash, lastActiveUserId: user.id },
      });
    } catch {
      // Lost a create race — the winner's row is the account.
      account = await prisma.account.findUnique({ where: { email } });
    }
  }
  if (!account) return null;

  await prisma.user.updateMany({
    where: { ...emailWhere(email), accountId: null },
    data: { accountId: account.id },
  });
  return account;
}

/**
 * The Account behind an email address, adopting legacy rows on the fly.
 * Null when the address has never been seen.
 */
export async function findOrAdoptAccountByEmail(rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  const account = await prisma.account.findUnique({ where: { email } });
  if (account) return account;

  const legacy = await prisma.user.findFirst({
    where: emailWhere(email),
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, passwordHash: true, accountId: true },
  });
  if (!legacy) return null;
  if (legacy.accountId) return prisma.account.findUnique({ where: { id: legacy.accountId } });
  return ensureAccountForUser(legacy);
}

/** Check a password for the person behind a User row (account hash first). */
export async function verifyPasswordForUser(userId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, account: { select: { passwordHash: true } } },
  });
  const hash = user?.account?.passwordHash ?? user?.passwordHash;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Set the person's password (account-wide). Clears legacy per-row hashes so a
 * stale pre-Account hash can never keep signing in after a change.
 */
export async function setPasswordForUser(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, accountId: true },
  });
  if (!user) return;
  const account = await ensureAccountForUser(user);
  if (account) {
    await prisma.$transaction([
      prisma.account.update({ where: { id: account.id }, data: { passwordHash: hash } }),
      prisma.user.updateMany({ where: { accountId: account.id }, data: { passwordHash: null } }),
    ]);
  } else {
    // Rows with no usable login (never had a hash) just get one directly.
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  }
}

/**
 * Every User row belonging to the same person — the fan-out set for identity
 * edits (name, phone, avatar, email). Always includes the given row.
 */
export async function accountUserIdsFor(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountId: true },
  });
  if (!user) return [];
  if (!user.accountId) return [user.id];
  const rows = await prisma.user.findMany({
    where: { accountId: user.accountId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Is this address already someone ELSE's login? Used by email-change and
 * registration duplicate checks. `ownAccountId` excludes the caller's own
 * account (and its member rows).
 */
export async function emailInUseByOther(rawEmail: string, ownAccountId: string | null): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const account = await prisma.account.findUnique({ where: { email }, select: { id: true } });
  if (account && account.id !== ownAccountId) return true;
  const row = await prisma.user.findFirst({
    where: {
      ...emailWhere(email),
      ...(ownAccountId ? { NOT: { accountId: ownAccountId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(row);
}
