import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Platform superadmin — no company, sees /superadmin. Only created when a
  // password is provided via env: seeding a known default password on every
  // deploy was a standing credential anyone could try against prod.
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!password) {
    console.log("Seed: SUPERADMIN_PASSWORD not set — superadmin unchanged.");
    return;
  }
  const email = (process.env.SUPERADMIN_EMAIL ?? "info@streamflaire.com").trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);
  // The login lives on the Account (multi-company model); the SUPERADMIN User
  // row is the console membership hanging off it.
  const account = await prisma.account.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: { email, passwordHash: hash },
  });
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, role: "SUPERADMIN" },
  });
  const admin = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: null, isActive: true, accountId: account.id },
      })
    : await prisma.user.create({
        data: {
          email,
          name: "Workbench Admin",
          role: "SUPERADMIN",
          accountId: account.id,
        },
      });
  console.log("Seed complete. Superadmin:", email, "id:", admin.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
