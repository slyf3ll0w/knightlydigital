import { PrismaClient } from "@prisma/client";

/**
 * Multi-company accounts backfill: give every existing User row an Account
 * (one per email address, the login identity).
 *
 * Run once after deploying the Account schema (needs DATABASE_URL):
 *   node scripts/backfill-accounts.mjs
 *
 * Safe to re-run — rows that already have an accountId are skipped, and
 * logins that happen before this runs self-heal the same way at sign-in
 * (lib/account.ts ensureAccountForUser). Legacy User.passwordHash values are
 * left in place as a fallback; they stop mattering the moment the Account
 * exists and are cleared on the next password change.
 */

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.user.findMany({
    where: { accountId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, passwordHash: true, isActive: true, createdAt: true },
  });
  console.log(`${orphans.length} user row(s) without an account.`);

  // Group case-insensitively — pre-normalization rows may differ in casing.
  const byEmail = new Map();
  for (const u of orphans) {
    const key = u.email.trim().toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(u);
  }

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const [email, rows] of byEmail) {
    // Oldest row with a hash carries the login (email was globally unique
    // before this migration, so in practice there is exactly one).
    const source = rows.find((r) => r.passwordHash);
    let account = await prisma.account.findUnique({ where: { email } });
    if (!account) {
      if (!source) {
        console.warn(`  ! ${email}: no password hash on any row — skipped (cannot sign in anyway).`);
        skipped += rows.length;
        continue;
      }
      const lastActive = rows.find((r) => r.isActive) ?? rows[0];
      account = await prisma.account.create({
        data: {
          email,
          passwordHash: source.passwordHash,
          lastActiveUserId: lastActive.id,
        },
      });
      created++;
    }
    const res = await prisma.user.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { accountId: account.id },
    });
    linked += res.count;
  }

  console.log(`Done. ${created} account(s) created, ${linked} row(s) linked, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
