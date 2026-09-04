import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Add a platform superadmin (console login at /superadmin/login).
 *
 *   node scripts/run-with-prod-db.mjs scripts/add-superadmin.mjs <email> [--name "Full Name"]
 *   (locally: DATABASE_URL=... node scripts/add-superadmin.mjs <email>)
 *
 * Password comes from SUPERADMIN_PASSWORD in the environment. Same shape as
 * prisma/seed.ts: the login lives on the Account, the SUPERADMIN User row
 * (no company) is the console membership hanging off it.
 *
 *  - No Account for the email yet  → created with the given password.
 *  - Account already exists (the person also signs into a tenant company)
 *    → their existing password is KEPT; only the console membership is added.
 *  - Already a superadmin → reactivated + relinked, nothing else changes.
 */
const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const nameIdx = args.indexOf("--name");
const name = nameIdx >= 0 ? args[nameIdx + 1] : "Workbench Admin";
const password = process.env.SUPERADMIN_PASSWORD;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("usage: node scripts/add-superadmin.mjs <email> [--name \"Full Name\"]  (SUPERADMIN_PASSWORD in env)");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  let account = await prisma.account.findUnique({ where: { email } });
  if (account) {
    console.log(`[add-superadmin] ${email} already has a login — keeping its password.`);
  } else {
    if (!password || password.length < 8) {
      console.error("[add-superadmin] SUPERADMIN_PASSWORD (8+ chars) is required for a brand-new login.");
      process.exit(1);
    }
    account = await prisma.account.create({
      data: { email, passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`[add-superadmin] created login for ${email}`);
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, role: "SUPERADMIN" },
    select: { id: true },
  });
  if (existing) {
    await prisma.user.updateMany({
      where: { id: existing.id },
      data: { passwordHash: null, isActive: true, accountId: account.id },
    });
    console.log(`[add-superadmin] ${email} was already a superadmin (user ${existing.id}) — reactivated.`);
  } else {
    const admin = await prisma.user.create({
      data: { email, name, role: "SUPERADMIN", accountId: account.id },
      select: { id: true },
    });
    console.log(`[add-superadmin] superadmin created: ${email} (user ${admin.id})`);
  }
} finally {
  await prisma.$disconnect();
}
