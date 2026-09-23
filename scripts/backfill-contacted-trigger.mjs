// One-time backfill (safe to re-run): give every existing "Contacted" pipeline
// column the CONTACT_MADE automation (a connected call or a team text moves
// the lead there). New boards seed it that way (lib/pipeline.ts
// DEFAULT_STAGES); boards seeded before the trigger existed had Contacted
// with no automation. Only touches a column that is literally named
// "Contacted" (any case), still has no automation, and whose company has no
// other stage already claiming CONTACT_MADE — a renamed or re-purposed board
// is left alone. Runs as part of `npm run db:predeploy`.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.pipelineStage.findMany({
    where: { name: { equals: "Contacted", mode: "insensitive" }, autoAdvanceOn: null, isConverted: false },
    select: { id: true, companyId: true },
  });
  if (candidates.length === 0) {
    console.log("[backfill-contacted-trigger] no Contacted columns without an automation; nothing to do");
    return;
  }
  const claimed = await prisma.pipelineStage.findMany({
    where: { companyId: { in: candidates.map((c) => c.companyId) }, autoAdvanceOn: "CONTACT_MADE" },
    select: { companyId: true },
  });
  const taken = new Set(claimed.map((c) => c.companyId));
  // One column per company: if a board somehow has two "Contacted" columns, the first wins.
  const seen = new Set();
  const ids = [];
  for (const c of candidates) {
    if (taken.has(c.companyId) || seen.has(c.companyId)) continue;
    seen.add(c.companyId);
    ids.push(c.id);
  }
  const res = ids.length
    ? await prisma.pipelineStage.updateMany({ where: { id: { in: ids } }, data: { autoAdvanceOn: "CONTACT_MADE" } })
    : { count: 0 };
  console.log(
    `[backfill-contacted-trigger] ${res.count} Contacted column${res.count === 1 ? "" : "s"} now advance on a call or text (${candidates.length - res.count} skipped)`
  );
}

main()
  .catch((err) => {
    console.error("[backfill-contacted-trigger] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
