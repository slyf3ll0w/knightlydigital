import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("ChangeMe123!", 12);

  // Streamflare superadmin — no company, can see all companies
  const admin = await prisma.user.upsert({
    where: { email: "admin@streamflaremedia.com" },
    update: {},
    create: {
      email: "admin@streamflaremedia.com",
      name: "Streamflare Admin",
      passwordHash: hash,
      role: "SUPERADMIN",
    },
  });

  console.log("Seed complete.");
  console.log("Superadmin email:    admin@streamflaremedia.com");
  console.log("Superadmin password: ChangeMe123!");
  console.log("IMPORTANT: Change the admin password after first login.");
  console.log("Admin user ID:", admin.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
