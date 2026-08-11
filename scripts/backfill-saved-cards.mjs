import { PrismaClient } from "@prisma/client";

/**
 * Copy the legacy single card-on-file (Contact.processorCustomerRef +
 * savedCardLabel/savedCardAt) into the SavedCard table as the contact's
 * default card. Runs from the start script (this machine has no direct prod
 * DB access). Idempotent — contacts that already have a SavedCard row are
 * skipped — and it never fails the boot.
 */
const prisma = new PrismaClient();

try {
  const contacts = await prisma.contact.findMany({
    where: { processorCustomerRef: { not: null }, savedCards: { none: {} } },
    select: {
      id: true,
      companyId: true,
      processorCustomerRef: true,
      savedCardLabel: true,
      savedCardAt: true,
    },
  });
  for (const c of contacts) {
    await prisma.savedCard.create({
      data: {
        companyId: c.companyId,
        contactId: c.id,
        instrumentRef: c.processorCustomerRef,
        label: c.savedCardLabel ?? "Saved card",
        isDefault: true,
        createdAt: c.savedCardAt ?? undefined,
      },
    });
  }
  console.log(
    contacts.length === 0
      ? "[saved-cards] nothing to backfill."
      : `[saved-cards] backfilled ${contacts.length} card(s).`
  );
} catch (err) {
  console.error("[saved-cards] backfill failed (boot continues):", err);
} finally {
  await prisma.$disconnect();
}
