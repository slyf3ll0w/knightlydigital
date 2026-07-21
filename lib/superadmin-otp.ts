import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Email second factor for the platform console. /api/superadmin/login-code
 * issues after a password check; NextAuth authorize() verifies during the
 * actual sign-in, so a session is never minted from the password alone.
 */

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** Mint a fresh 6-digit code for the user, replacing any outstanding one. */
export async function issueSuperadminLoginCode(userId: string): Promise<string> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.superadminLoginCode.deleteMany({ where: { userId } }),
    prisma.superadminLoginCode.create({
      data: { userId, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    }),
  ]);
  return code;
}

/** Check a submitted code; consumes it on success, burns an attempt on miss. */
export async function verifySuperadminLoginCode(userId: string, raw: unknown): Promise<boolean> {
  const record = await prisma.superadminLoginCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt < new Date() || record.attempts >= MAX_ATTEMPTS) return false;

  const code = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (
    code.length === 6 &&
    crypto.timingSafeEqual(Buffer.from(hashCode(code)), Buffer.from(record.codeHash))
  ) {
    await prisma.superadminLoginCode.deleteMany({ where: { userId } });
    return true;
  }

  await prisma.superadminLoginCode.update({
    where: { id: record.id },
    data: { attempts: { increment: 1 } },
  });
  return false;
}
