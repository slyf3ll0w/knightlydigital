// Read-only prod check: did the SavedCard table land? Run via:
//   npx -y @railway/cli run --service Postgres npx tsx scripts/check-savedcard-schema.mts
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const cols = await prisma.$queryRaw<{ column_name: string }[]>`
  SELECT column_name FROM information_schema.columns WHERE table_name = 'SavedCard'
`;
if (cols.length === 0) {
  console.log("NOT YET");
} else {
  const backfilled = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "SavedCard"
  `;
  const legacy = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "Contact" WHERE "processorCustomerRef" IS NOT NULL
  `;
  console.log(
    `SAVEDCARD LIVE — cols: ${cols.map((c) => c.column_name).join(",")} · rows: ${backfilled[0].n} · legacy contacts w/ card: ${legacy[0].n}`
  );
}
await prisma.$disconnect();
