import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    // Generous limits so multi-step writes survive slow connections instead
    // of timing out mid-request (default is 5s)
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });

globalForPrisma.prisma = prisma;
