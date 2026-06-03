import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("ChangeMe123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@streamflaremedia.com" },
    update: {},
    create: {
      email: "admin@streamflaremedia.com",
      name: "Admin",
      passwordHash: hash,
      role: "ADMIN",
    },
  });

  console.log("Seed complete.");
  console.log("Admin email:    admin@streamflaremedia.com");
  console.log("Admin password: ChangeMe123!");
  console.log("IMPORTANT: Change the admin password after first login.");
  console.log("Admin user ID:", admin.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
