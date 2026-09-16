// Backfill (safe to re-run): Contact.phoneDigits = digits-only copy of
// Contact.phone (last 10 for US numbers, raw digits for 7–9 digit local
// numbers, NULL when there's nothing to compare on). The write hook in
// lib/db.ts keeps the column current from here on; this catches rows written
// before it existed and contacts created through nested relation writes the
// hook can't see. Same rule as lib/phone.ts phoneDigits(). Only rows whose
// mirror is stale are touched, so a repeat run on every deploy is one cheap
// UPDATE. Runs as part of `npm run db:predeploy`.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.$executeRaw`
    UPDATE "Contact"
    SET "phoneDigits" = sub.digits
    FROM (
      SELECT "id",
        CASE
          WHEN length(d) >= 10 THEN right(d, 10)
          WHEN length(d) >= 7 THEN d
          ELSE NULL
        END AS digits
      FROM (SELECT "id", regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') AS d FROM "Contact") x
    ) sub
    WHERE "Contact"."id" = sub."id"
      AND "Contact"."phoneDigits" IS DISTINCT FROM sub.digits`;
  console.log(`[backfill-phone-digits] ${updated} contact${updated === 1 ? "" : "s"} updated`);
}

main()
  .catch((e) => {
    console.error("[backfill-phone-digits] failed", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
