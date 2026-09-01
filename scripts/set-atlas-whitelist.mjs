/**
 * Whitelist companies for full Atlas (assistantEnabled = true) — the Atlas
 * paywall exempts them entirely. Run after the paywall deploy so the
 * Streamflaire and Summit Plumbing test accounts keep unmetered Atlas.
 *
 * Run with: DATABASE_URL=<public proxy url> node scripts/set-atlas-whitelist.mjs [pattern ...]
 * Default patterns: streamflaire, streamflare, summit
 *
 * Prints every match and what changed; add --dry to only look.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const patterns = args.filter((a) => a !== "--dry");
const terms = patterns.length > 0 ? patterns : ["streamflaire", "streamflare", "summit"];

const companies = await prisma.company.findMany({
  where: {
    OR: terms.flatMap((t) => [
      { name: { contains: t, mode: "insensitive" } },
      { slug: { contains: t, mode: "insensitive" } },
    ]),
  },
  select: { id: true, name: true, slug: true, assistantEnabled: true },
});

if (companies.length === 0) {
  console.log(`No companies matched: ${terms.join(", ")}`);
  process.exit(0);
}

for (const c of companies) {
  const state =
    c.assistantEnabled === true ? "already whitelisted" : dry ? "WOULD whitelist" : "whitelisting";
  console.log(`${c.name} (${c.slug}) — ${state}`);
  if (!dry && c.assistantEnabled !== true) {
    // updateMany, not update — update() RETURNS the full row, which throws
    // P2022 when the client knows columns the live DB hasn't gained yet.
    await prisma.company.updateMany({ where: { id: c.id }, data: { assistantEnabled: true } });
  }
}

await prisma.$disconnect();
console.log(dry ? "Dry run — nothing written." : "Done.");
