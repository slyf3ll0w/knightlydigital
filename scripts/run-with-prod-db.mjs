#!/usr/bin/env node
/**
 * Run a script against the PRODUCTION database from a dev box:
 *   node scripts/run-with-prod-db.mjs scripts/migrate-booking-types.mjs [--apply]
 * Fetches the Postgres service's DATABASE_PUBLIC_URL from Railway (never
 * printed) and hands it to the child as DATABASE_URL — same recipe as
 * scripts/db-push-prod.mjs.
 */
import { execFileSync, spawnSync } from "node:child_process";

const [script, ...extra] = process.argv.slice(2);
if (!script) {
  console.error("usage: node scripts/run-with-prod-db.mjs <script.mjs> [args]");
  process.exit(1);
}
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
console.log(`Running ${script} ${extra.join(" ")} against production (${new URL(url).hostname})`.trim());
const res = spawnSync(process.execPath, [script, ...extra], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
process.exit(res.status ?? 1);
