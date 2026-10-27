#!/usr/bin/env node
/**
 * Run a script against the PRODUCTION database from a dev box:
 *   node scripts/run-with-prod-db.mjs scripts/migrate-booking-types.mjs [--apply]
 * Fetches the Postgres service's DATABASE_PUBLIC_URL from Railway (never
 * printed) and hands it to the child as DATABASE_URL — same recipe as
 * scripts/db-push-prod.mjs.
 */
import { execFileSync, spawnSync } from "node:child_process";

// --env <name> (default production) picks the Railway environment; the repo link
// points at staging, so without this the "prod" runner silently read staging.
const argv = process.argv.slice(2);
let environment = "production";
const envAt = argv.indexOf("--env");
if (envAt !== -1) { environment = argv[envAt + 1] ?? environment; argv.splice(envAt, 2); }
const [script, ...extra] = argv;
if (!script) {
  console.error("usage: node scripts/run-with-prod-db.mjs [--env production|staging] <script.mjs> [args]");
  process.exit(1);
}
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const kv = execFileSync(npx, ["-y", "@railway/cli", "variables", "--service", "Postgres", "--environment", environment, "--kv"], {
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
console.log(`Running ${script} ${extra.join(" ")} against ${environment} (${new URL(url).hostname})`.trim());
const res = spawnSync(process.execPath, [script, ...extra], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
process.exit(res.status ?? 1);
