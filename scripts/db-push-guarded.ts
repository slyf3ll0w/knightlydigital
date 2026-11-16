/**
 * `npm run db:push` — push prisma/schema.prisma to the database, refusing
 * any change that destroys data unless it was approved (lib/schema-guard.ts).
 * Runs on every deploy (db:predeploy); a refusal fails the deploy, and the
 * release that was already serving keeps serving.
 *
 *   tsx scripts/db-push-guarded.ts            # guard, then push
 *   tsx scripts/db-push-guarded.ts --check    # guard only: print the SQL and the verdict, change nothing
 *
 * To let a drop through: add a line to prisma/approved-drops.txt with
 * today's date and the change exactly as the refusal prints it, in the same
 * commit as the schema change. SCHEMA_GUARD=off skips the guard (emergency
 * only; say why in the deploy note).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { APPROVALS_FILE, APPROVAL_DAYS, destructiveChanges, parseApprovals, unapprovedChanges } from "../lib/schema-guard";

const PRISMA = "node_modules/prisma/build/index.js";
const SCHEMA = "prisma/schema.prisma";
const checkOnly = process.argv.includes("--check");

function push(): never {
  const res = spawnSync(process.execPath, [PRISMA, "db", "push", "--accept-data-loss"], {
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}

if (process.env.SCHEMA_GUARD === "off") {
  console.warn("[schema-guard] SCHEMA_GUARD=off — pushing without the data-loss check.");
  if (checkOnly) process.exit(0);
  push();
}

// The SQL the push is about to run: live database → schema file. Read-only.
const diff = spawnSync(
  process.execPath,
  [PRISMA, "migrate", "diff", "--from-schema-datasource", SCHEMA, "--to-schema-datamodel", SCHEMA, "--script"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);
if (diff.status !== 0) {
  console.error("[schema-guard] Could not read the pending schema change, so nothing was pushed.");
  console.error((diff.stderr || diff.stdout || "").trim());
  process.exit(1);
}
const sql = diff.stdout;
const changes = destructiveChanges(sql);

if (/^\s*(--[^\n]*\s*)*$/.test(sql)) {
  console.log("[schema-guard] Database already matches the schema.");
} else {
  console.log("[schema-guard] Pending schema change:\n" + sql.trim());
}

const approvals = existsSync(APPROVALS_FILE) ? parseApprovals(readFileSync(APPROVALS_FILE, "utf8")) : [];
const blocked = unapprovedChanges(changes, approvals, new Date());

if (blocked.length > 0) {
  const today = new Date().toISOString().slice(0, 10);
  console.error(
    [
      "",
      "[schema-guard] DEPLOY REFUSED — this schema change would destroy data:",
      ...blocked.map((c) => `    ${c}`),
      "",
      "Nothing was changed; the release that was live is still serving.",
      "If this is a rename, keep the column and rename only the field with @map.",
      `If the data really should go, add these lines to ${APPROVALS_FILE} and deploy again`,
      `(an approval is good for ${APPROVAL_DAYS} days):`,
      ...blocked.map((c) => `    ${today} ${c}`),
      "",
    ].join("\n")
  );
  process.exit(1);
}

if (changes.length > 0) {
  console.log("[schema-guard] Approved data-destroying changes going through:\n" + changes.map((c) => `    ${c}`).join("\n"));
}
if (checkOnly) {
  console.log("[schema-guard] --check: nothing pushed.");
  process.exit(0);
}
push();
