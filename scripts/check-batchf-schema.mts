// Read-only prod check: did the Batch F schema changes land? Run via:
//   npx -y @railway/cli run --service Postgres npx tsx scripts/check-batchf-schema.mts
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE (table_name = 'TimeEntry' AND column_name = 'endClientKey')
     OR (table_name = 'JobNote' AND column_name = 'clientKey')
     OR (table_name = 'Job' AND column_name = 'propertyId')
     OR (table_name = 'Quote' AND column_name = 'propertyId')
     OR (table_name = 'Appointment' AND column_name = 'propertyId')
     OR (table_name = 'Subscription' AND column_name = 'propertyId')
     OR (table_name = 'Expense' AND column_name = 'updatedAt')
     OR (table_name = 'QuickBooksConnection' AND column_name = 'surchargeItemId')
     OR (table_name = 'QuoteRevision' AND column_name = 'snapshot')
`;
const nullable = await prisma.$queryRaw<{ column_name: string; is_nullable: string }[]>`
  SELECT column_name, is_nullable FROM information_schema.columns
  WHERE table_name = 'Subscription' AND column_name IN ('interval', 'nextRunDate')
`;
console.log(JSON.stringify({ found: cols.length, cols, subscriptionNullable: nullable }, null, 2));
await prisma.$disconnect();
