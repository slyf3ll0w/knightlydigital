// Debug: list companies with payments-gate / assistant flags.
// Usage: railway run node scripts/debug-list-companies.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const companies = await prisma.company.findMany({
  select: {
    id: true,
    name: true,
    slug: true,
    paymentsWaived: true,
    finixOnboardingState: true,
  },
  orderBy: { createdAt: "asc" },
});
console.log(JSON.stringify(companies, null, 1));
await prisma.$disconnect();
