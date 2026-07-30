/**
 * Move existing job photos out of Postgres and into R2.
 *
 * Safe to run repeatedly and safe to interrupt: it works one photo at a time
 * and only clears a row's bytes AFTER the object is confirmed uploaded, so a
 * crash mid-run leaves every photo readable from one place or the other. The
 * serving route reads whichever is populated, so the app keeps working
 * throughout.
 *
 * Usage (needs the R2 vars and a database URL in the environment):
 *   node scripts/migrate-photos-to-r2.mjs [--dry-run] [--limit=N]
 *
 * Against production, via the Railway CLI:
 *   npx -y @railway/cli run --service Postgres node scripts/migrate-photos-to-r2.mjs --dry-run
 */
import { PrismaClient } from "@prisma/client";
import { AwsClient } from "aws4fetch";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

const url = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length && !dryRun) {
  console.error(`Missing R2 config: ${missing.join(", ")}`);
  process.exit(1);
}

const endpoint =
  process.env.R2_ENDPOINT?.replace(/\/+$/, "") ??
  `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const mb = (n) => (n / 1024 / 1024).toFixed(1);

async function main() {
  const pending = await prisma.jobPhoto.findMany({
    where: { storageKey: null, data: { not: null } },
    select: { id: true, jobId: true, mimeType: true, job: { select: { companyId: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${pending.length} photo(s) still stored in Postgres${dryRun ? " (dry run)" : ""}`);
  if (!pending.length) return;

  let moved = 0;
  let freed = 0;
  let failed = 0;

  for (const p of pending.slice(0, limit)) {
    // Re-read the bytes one row at a time — loading every photo at once is
    // what makes this table painful in the first place.
    const row = await prisma.jobPhoto.findUnique({
      where: { id: p.id },
      select: { data: true },
    });
    if (!row?.data) continue;

    const body = Buffer.from(row.data);
    const mime = p.mimeType ?? "image/jpeg";
    const key = `companies/${p.job.companyId}/jobs/${p.jobId}/${p.id}.${EXT[mime] ?? "bin"}`;

    if (dryRun) {
      console.log(`  would upload ${key} (${mb(body.byteLength)} MB)`);
      moved++;
      freed += body.byteLength;
      continue;
    }

    try {
      const res = await client.fetch(
        `${endpoint}/${process.env.R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "PUT",
          body,
          headers: { "Content-Type": mime, "Content-Length": String(body.byteLength) },
        }
      );
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);

      // Only now is it safe to drop the bytes.
      await prisma.jobPhoto.update({
        where: { id: p.id },
        data: { storageKey: key, sizeBytes: body.byteLength, data: null },
      });
      moved++;
      freed += body.byteLength;
      console.log(`  moved ${key} (${mb(body.byteLength)} MB)`);
    } catch (err) {
      failed++;
      console.error(`  FAILED ${p.id}: ${err.message}`);
    }
  }

  console.log(
    `\n${dryRun ? "would move" : "moved"} ${moved} photo(s), ${mb(freed)} MB out of Postgres` +
      (failed ? `, ${failed} failed (left in place, rerun to retry)` : "")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
