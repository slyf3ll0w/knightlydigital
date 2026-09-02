/**
 * Push prisma/schema.prisma to the PRODUCTION database.
 *
 * The repo has no migrations dir — prod schema changes are `prisma db push`
 * against the Postgres service's public proxy URL. The app service only has
 * the internal DATABASE_URL, so this fetches DATABASE_PUBLIC_URL from the
 * Postgres service through the Railway CLI (saved login) and runs the push
 * with it, never printing the URL.
 *
 *   node scripts/db-push-prod.mjs                 # additive changes
 *   node scripts/db-push-prod.mjs --accept-data-loss   # drops/renames
 *
 * Deploy order for a column the running code selects on every page:
 * ADD the new column (push), deploy the code, THEN drop the old one (push
 * with --accept-data-loss) — never drop first.
 */
import { execFileSync, spawnSync } from "node:child_process";

const extra = process.argv.slice(2);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const kv = execFileSync(npx, ["-y", "@railway/cli", "variables", "--service", "Postgres", "--kv"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
  shell: process.platform === "win32",
});
const line = kv.split(/\r?\n/).find((l) => l.startsWith("DATABASE_PUBLIC_URL="));
if (!line) {
  console.error("DATABASE_PUBLIC_URL not found on the Postgres service — is the Railway CLI logged in and linked?");
  process.exit(1);
}
const url = line.slice("DATABASE_PUBLIC_URL=".length);
console.log(`Pushing schema to production (${new URL(url).hostname}) ${extra.join(" ")}`.trim());

const res = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", ...extra],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } }
);
process.exit(res.status ?? 1);
