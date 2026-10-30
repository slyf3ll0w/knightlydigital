// One-time backfill (safe to re-run): stamp companyId + contactId on every
// photo that predates the Gallery plan. JobPhoto used to reach its company
// only through the job; a photo can now hang off a quote with no job at all,
// so the owner columns are set directly on every new row and the serving
// route, the storage rollup, the website feed and the coming Gallery tab read
// them without the join. Runs as part of `npm run db:predeploy`, after
// `db:push` has added the columns. One UPDATE … FROM, no row loop.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.$executeRawUnsafe(`
    UPDATE "JobPhoto" jp
    SET "companyId" = j."companyId",
        "contactId" = j."contactId"
    FROM "Job" j
    WHERE j.id = jp."jobId"
      AND (jp."companyId" IS NULL OR jp."contactId" IS NULL)
  `);
  console.log(`[backfill-photo-owners] ${n} photo${n === 1 ? "" : "s"} stamped with company + client`);
}

main()
  .catch((e) => {
    console.error("[backfill-photo-owners] failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
