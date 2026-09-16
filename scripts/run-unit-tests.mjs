// `npm run test:unit` — runs every pure unit-test script in scripts/test-*.ts
// in sequence and fails on the first red one. Sets a placeholder DATABASE_URL
// when none is present: several tests import modules that construct the
// Prisma client at load time, but none of them ever query it.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const scripts = readdirSync("scripts")
  .filter((f) => /^test-.*\.ts$/.test(f))
  .sort();

const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://u:p@localhost:5432/unused",
};

let failed = 0;
for (const script of scripts) {
  process.stdout.write(`\n▶ ${script}\n`);
  const res = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", `scripts/${script}`], {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    failed++;
    process.stdout.write(`✗ ${script} failed (exit ${res.status})\n`);
  }
}

process.stdout.write(`\n${scripts.length - failed}/${scripts.length} unit-test scripts passed\n`);
process.exit(failed === 0 ? 0 : 1);
