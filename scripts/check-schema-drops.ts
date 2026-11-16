/**
 * CI's early warning for data-destroying schema changes (readiness review
 * 2026-11-02, B1). The deploy itself enforces this against the real
 * database (scripts/db-push-guarded.ts); this step says so at push time,
 * before anything reaches a deploy, by diffing the branch's
 * prisma/schema.prisma against the one on origin/main. Same rules and the
 * same approvals file as the deploy guard (lib/schema-guard.ts).
 *
 *   npx tsx scripts/check-schema-drops.ts <base-schema-path>
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { APPROVALS_FILE, APPROVAL_DAYS, destructiveChanges, parseApprovals, unapprovedChanges } from "../lib/schema-guard";

const base = process.argv[2];
if (!base || !existsSync(base) || readFileSync(base, "utf8").trim() === "") {
  console.log("[schema-drops] no base schema to compare against — skipped");
  process.exit(0);
}

const diff = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-schema-datamodel", base, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);
if (diff.status !== 0) {
  console.error("[schema-drops] prisma migrate diff failed\n" + (diff.stderr || diff.stdout || "").trim());
  process.exit(1);
}

const changes = destructiveChanges(diff.stdout);
if (changes.length === 0) {
  console.log("[schema-drops] schema change is additive (or none) — ok");
  process.exit(0);
}
const approvals = existsSync(APPROVALS_FILE) ? parseApprovals(readFileSync(APPROVALS_FILE, "utf8")) : [];
const blocked = unapprovedChanges(changes, approvals, new Date());
console.log("[schema-drops] data-destroying changes in this schema:\n" + changes.map((c) => `    ${c}`).join("\n"));
if (blocked.length === 0) {
  console.log(`[schema-drops] all approved in ${APPROVALS_FILE}`);
  process.exit(0);
}
const today = new Date().toISOString().slice(0, 10);
console.error(
  [
    "",
    "[schema-drops] FAILED — the deploy will refuse this schema change.",
    "If it is a rename, keep the column and rename only the field with @map.",
    `If the data really should go, add these lines to ${APPROVALS_FILE} (good for ${APPROVAL_DAYS} days):`,
    ...blocked.map((c) => `    ${today} ${c}`),
    "",
  ].join("\n")
);
process.exit(1);
