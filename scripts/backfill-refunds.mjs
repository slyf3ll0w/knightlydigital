/**
 * Backfill Refund rows from the legacy encoding, where a refund only existed
 * as a "Refunded $X.XX (TRxxx)" note appended to Payment.details. One-time
 * companion to the Refund model migration (2026-08); idempotent — reversal
 * ids already backfilled are skipped, so it's safe to re-run.
 *
 *   DATABASE_URL=... node scripts/backfill-refunds.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const payments = await prisma.payment.findMany({
  where: { details: { contains: "Refunded $" } },
  select: { id: true, companyId: true, details: true },
});

let created = 0;
let skipped = 0;
for (const p of payments) {
  // The refund route always wrote `Refunded $<toFixed(2)> (<reversal id>)`
  const matches = p.details.matchAll(
    /Refunded \$([\d,]+\.\d{2}) \(([A-Za-z0-9_-]+)\)/g
  );
  for (const m of matches) {
    const amount = Number(m[1].replace(/,/g, ""));
    const reversalRef = m[2];
    if (!(amount > 0)) continue;
    const existing = await prisma.refund.findFirst({ where: { reversalRef } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.refund.create({
      data: { companyId: p.companyId, paymentId: p.id, amount, reversalRef },
    });
    created++;
    console.log(`  + ${reversalRef}: $${amount.toFixed(2)} on payment ${p.id}`);
  }
}

console.log(
  `Done — ${payments.length} payments with refund notes, ${created} Refund rows created, ${skipped} already present.`
);
await prisma.$disconnect();
