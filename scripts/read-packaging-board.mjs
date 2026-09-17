/**
 * Print the packaging board (/superadmin/packaging) as markdown.
 *
 * This is the read-back: once the columns are settled, run this and hand the
 * output to whoever is building the pricing page — it says which features are
 * free, which are paid, and what every plan is called and costs.
 *
 *   node scripts/read-packaging-board.mjs              # production
 *   node scripts/read-packaging-board.mjs --staging    # the staging env
 *   node scripts/read-packaging-board.mjs --json       # raw lanes + cards
 *
 * Like scripts/db-push-prod.mjs, the connection string comes from the Railway
 * CLI (saved login) and is never printed.
 */
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const environment = args.includes("--staging") ? "staging" : "production";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const kv = execFileSync(
  npx,
  ["-y", "@railway/cli", "variables", "--service", "Postgres", "--environment", environment, "--kv"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" }
);
const line = kv.split(/\r?\n/).find((l) => l.startsWith("DATABASE_PUBLIC_URL="));
if (!line) {
  console.error(
    "DATABASE_PUBLIC_URL not found on the Postgres service — is the Railway CLI logged in and linked?"
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: line.slice("DATABASE_PUBLIC_URL=".length) } },
});

const lanes = await prisma.packagingLane.findMany({
  orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  include: { cards: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] } },
});
await prisma.$disconnect();

if (asJson) {
  console.log(JSON.stringify(lanes, null, 2));
  process.exit(0);
}

const out = ["# WorkBench packaging plan", ""];
for (const lane of lanes.filter((l) => l.kind !== "BACKLOG")) {
  const price = [lane.price, lane.priceNote].filter(Boolean).join(" — ");
  out.push(`## ${lane.name} (${lane.kind === "ADDON" ? "add-on" : "tier"})`);
  if (price) out.push(`**Price:** ${price}`);
  if (lane.blurb) out.push(`**Pitch:** ${lane.blurb}`);
  if (lane.accent) out.push(`**Accent:** ${lane.accent}`);
  out.push("");
  if (lane.cards.length === 0) out.push("_No features assigned yet._", "");
  for (const card of lane.cards) {
    out.push(`- **${card.title}**${card.group ? ` _(${card.group})_` : ""}`);
    if (card.body) out.push(`  ${card.body}`);
  }
  out.push("");
}
for (const lane of lanes.filter((l) => l.kind === "BACKLOG")) {
  out.push(`## ${lane.name} — not yet placed (${lane.cards.length})`, "");
  for (const card of lane.cards) out.push(`- ${card.title}`);
  out.push("");
}
console.log(out.join("\n").trimEnd());
