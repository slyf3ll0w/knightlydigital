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
  const email = process.env.SUPERADMIN_EMAIL ?? "admin@streamflaremedia.com";
  const hash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: "SUPERADMIN", isActive: true },
    create: {
      email,
      name: "Workbench Admin",
      passwordHash: hash,
      role: "SUPERADMIN",
    },
  });
  console.log("Seed complete. Superadmin:", email, "id:", admin.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
