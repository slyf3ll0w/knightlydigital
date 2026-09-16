// Idempotent (runs on every deploy via `npm run db:predeploy`): one DEPOSIT
// invoice per quote, enforced by a partial unique index Prisma's schema can't
// express (`@unique` would also forbid a quote's final invoice). The app
// already claims approval/convert inside transactions; this is the
// belt-and-braces guarantee against two approvals minting two deposit
// invoices. If existing data already violates it, the index is skipped with a
// loud message rather than failing the deploy — clean the duplicates by hand
// (archive/delete the extra deposit invoice) and the next deploy adds it.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const INDEX = "Invoice_one_deposit_per_quote";

async function main() {
  const dupes = await prisma.$queryRawUnsafe(
    `SELECT "quoteId", count(*)::int AS n FROM "Invoice"
     WHERE "kind" = 'DEPOSIT' AND "quoteId" IS NOT NULL
     GROUP BY "quoteId" HAVING count(*) > 1`
  );
  if (Array.isArray(dupes) && dupes.length > 0) {
    console.error(
      `[ensure-deposit-invoice-index] SKIPPED — ${dupes.length} quote(s) already have more than one deposit invoice:`,
      dupes.map((d) => `${d.quoteId} (${d.n})`).join(", ")
    );
    return;
  }
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX}" ON "Invoice" ("quoteId")
     WHERE "kind" = 'DEPOSIT' AND "quoteId" IS NOT NULL`
  );
  console.log(`[ensure-deposit-invoice-index] ${INDEX} in place`);
}

main()
  .catch((e) => {
    // Never block a deploy on this guard — the app-level claims still hold.
    console.error("[ensure-deposit-invoice-index] failed (deploy continues)", e);
  })
  .finally(() => prisma.$disconnect());
