-- Deduplicate PaymentReminder rows before adding the unique constraint:
-- keep the earliest reminder per (invoiceId, type), delete the rest.
DELETE FROM "PaymentReminder" a
USING "PaymentReminder" b
WHERE a."invoiceId" = b."invoiceId"
  AND a."type" = b."type"
  AND a."id" <> b."id"
  AND (b."sentAt" < a."sentAt" OR (b."sentAt" = a."sentAt" AND b."id" < a."id"));

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentReminder_invoiceId_type_key" ON "PaymentReminder"("invoiceId", "type");
