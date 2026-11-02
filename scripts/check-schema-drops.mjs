// CI guard against destructive schema changes (readiness review 2026-11-02, B1).
//
// Deploys run `prisma db push --accept-data-loss`, which has no migration
// history and no rollback: a renamed or removed column is a silent DROP on
// production data. Until the schema moves to `prisma migrate`, this step
// diffs the branch's prisma/schema.prisma against the one on origin/main
// and fails when the SQL Prisma would run contains a DROP TABLE / DROP COLUMN
// / type change — unless the head commit message carries `[allow-drop]`,
// which is the written acknowledgement that the data loss is intended.
//
// Usage (CI): node scripts/check-schema-drops.mjs <base-schema-path>
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.argv[2];
if (!base || !existsSync(base)) {
  console.log("[schema-drops] no base schema to compare against — skipped");
  process.exit(0);
}

const head = execFileSync("git", ["log", "-1", "--pretty=%B"], { encoding: "utf8" });
const allowed = /\[allow-drop\]/i.test(head);

let script = "";
try {
  script = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "diff", "--from-schema-datamodel", base, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    { encoding: "utf8", shell: process.platform === "win32" }
  );
} catch (err) {
  console.error("[schema-drops] prisma migrate diff failed", err?.message ?? err);
  process.exit(1);
}

const destructive = script
  .split("\n")
  .filter((l) => /^\s*(DROP TABLE|DROP COLUMN|ALTER TABLE .* DROP COLUMN|ALTER COLUMN .* (SET DATA TYPE|TYPE) )/i.test(l) || /DROP COLUMN/i.test(l) || /DROP TABLE/i.test(l));

if (destructive.length === 0) {
  console.log("[schema-drops] schema change is additive (or none) — ok");
  process.exit(0);
}
console.log("[schema-drops] destructive statements Prisma would run on deploy:\n" + destructive.map((l) => "  " + l.trim()).join("\n"));
if (allowed) {
  console.log("[schema-drops] allowed by [allow-drop] in the commit message");
  process.exit(0);
}
console.error("\n[schema-drops] FAILED: this schema change drops data on `prisma db push --accept-data-loss`.\n" +
  "Rename safely (add the new column, backfill, drop later) or, when the loss is intended, put [allow-drop] in the commit message.");
process.exit(1);
