import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { sendEmail, passwordResetEmail } from "@/lib/email";

/**
 * A login a manager created on Add team member (security audit 2026-11-01,
 * finding 5).
 *
 * The manager types the person's starting password, which is fine inside
 * that one company. It is NOT fine once a second company attaches the same
 * email: whoever typed the first password could sign in and read the second
 * company as that person. So a password is "provisional" until the person
 * has chosen one themselves — `Account.passwordChangedAt` is null exactly
 * then (self-signup, a reset and the profile form all stamp it;
 * scripts/backfill-password-chosen.mjs stamped every login that had already
 * been used before this rule shipped). When a company attaches to a
 * provisional login, the password is dropped and the person is emailed a
 * set-your-password link instead; every session on it ends.
 */
export function isProvisionalPassword(account: { passwordHash: string | null; passwordChangedAt: Date | null }): boolean {
  return Boolean(account.passwordHash) && !account.passwordChangedAt;
}

/**
 * Drop a provisional password and email the person a one-hour link to set
 * their own. `userId` is the membership the token hangs on (any of theirs
 * works — the reset lands on the Account). Best effort on the email; the
 * password is gone either way, which is the point.
 */
export async function replaceProvisionalPassword(params: {
  accountId: string;
  userId: string;
  email: string;
  name: string;
}): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.$transaction([
    prisma.account.update({
      where: { id: params.accountId },
      // passwordChangedAt = now evicts every session minted before it (lib/permissions.ts)
      data: { passwordHash: null, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: params.userId, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: params.userId, tokenHash, expiresAt: new Date(Date.now() + 60 * 60_000) },
    }),
  ]);
  const base = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const resetUrl = `${base}/reset-password?token=${token}&email=${encodeURIComponent(params.email)}`;
  const { subject, html } = passwordResetEmail({ name: params.name, resetUrl, hasPassword: false });
  await sendEmail({ to: params.email, subject, html }).catch((e) => reportError("[team-login] set-password email failed", e));
}
