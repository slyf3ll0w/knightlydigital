import { PrismaClient } from "@prisma/client";

/**
 * Assign per-company numbers to contracts and appointments that predate the
 * contractNumber/appointmentNumber columns. Runs from the start script (this
 * machine has no direct prod DB access). Idempotent — only rows with a NULL
 * number are touched, ordered by createdAt so history numbers read naturally —
 * and it never fails the boot.
 */
const prisma = new PrismaClient();

async function backfill(modelName, numberField) {
  const model = prisma[modelName];
  const rows = await model.findMany({
    where: { [numberField]: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, companyId: true },
  });
  if (rows.length === 0) {
    console.log(`[doc-numbers] ${modelName}: nothing to backfill.`);
    return;
  }
  // Continue each company's sequence past any already-assigned numbers
  const next = new Map();
  const maxima = await model.groupBy({
    by: ["companyId"],
    _max: { [numberField]: true },
  });
  for (const m of maxima) next.set(m.companyId, (m._max[numberField] ?? 0) + 1);

  for (const row of rows) {
    const n = next.get(row.companyId) ?? 1;
    next.set(row.companyId, n + 1);
    await model.update({ where: { id: row.id }, data: { [numberField]: n } });
  }
  console.log(`[doc-numbers] ${modelName}: numbered ${rows.length} rows.`);
}

try {
  await backfill("contract", "contractNumber");
  await backfill("appointment", "appointmentNumber");
} catch (err) {
  console.error("[doc-numbers] backfill failed (boot continues):", err);
} finally {
  await prisma.$disconnect();
}
