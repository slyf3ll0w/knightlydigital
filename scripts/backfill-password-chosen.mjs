// One-time backfill (safe to re-run): stamp Account.passwordChangedAt on
// every login that has already been used. Security audit 2026-11-01,
// finding 5: a null passwordChangedAt now means "the password was typed by a
// manager on Add team member and the person has never chosen their own" —
// such a login gets a set-your-password email instead of keeping that
// password when a SECOND company attaches to it (lib/team-login.ts). People
// who signed up themselves or have been signing in for months must not be
// caught by that rule, so anyone whose account has ever carried a session
// (lastActiveUserId set) is stamped with their account's creation time —
// in the past, so no live session is evicted. Runs in `npm run db:predeploy`.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.account.findMany({
    where: { passwordChangedAt: null, lastActiveUserId: { not: null }, passwordHash: { not: null } },
    select: { id: true, createdAt: true },
  });
  if (candidates.length === 0) {
    console.log("[backfill-password-chosen] nothing to stamp");
    return;
  }
  let stamped = 0;
  for (const a of candidates) {
    await prisma.account.update({ where: { id: a.id }, data: { passwordChangedAt: a.createdAt } });
    stamped++;
  }
  console.log(`[backfill-password-chosen] stamped ${stamped} account(s)`);
}

main()
  .catch((e) => {
    console.error("[backfill-password-chosen] failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
