// Temp: whose card got backfilled, and do they have an open invoice?
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const cards = await prisma.savedCard.findMany({
  include: { contact: { select: { id: true, firstName: true, lastName: true, companyId: true, company: { select: { name: true } } } } },
});
for (const c of cards) {
  const openInvoices = await prisma.invoice.findMany({
    where: { contactId: c.contactId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
    select: { id: true, invoiceNumber: true, total: true, status: true },
  });
  console.log(JSON.stringify({
    label: c.label, isDefault: c.isDefault,
    contact: `${c.contact.firstName} ${c.contact.lastName}`, contactId: c.contact.id,
    company: c.contact.company.name, companyId: c.contact.companyId,
    openInvoices,
  }, null, 2));
}
await prisma.$disconnect();
