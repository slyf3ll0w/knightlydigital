// Temp verification helper for the PAID/APPROVED stamps: seeds one approved
// quote + one paid invoice into the demo company, prints their tokens, and
// cleans them up again. Run via:
//   npx -y @railway/cli run --service Postgres npx tsx scripts/seed-stamp-check.mts create
//   npx -y @railway/cli run --service Postgres npx tsx scripts/seed-stamp-check.mts cleanup
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const MARKER = "Stamp check (temp)";
const mode = process.argv[2];

const demo = await prisma.company.findFirst({
  where: { slug: { contains: "demo" } },
  select: { id: true, name: true },
});
if (!demo) throw new Error("No demo company found");

if (mode === "create") {
  const contact = await prisma.contact.findFirst({
    where: { companyId: demo.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!contact) throw new Error("Demo company has no contacts");

  const maxQ = await prisma.quote.aggregate({ where: { companyId: demo.id }, _max: { quoteNumber: true } });
  const maxI = await prisma.invoice.aggregate({ where: { companyId: demo.id }, _max: { invoiceNumber: true } });

  const quote = await prisma.quote.create({
    data: {
      companyId: demo.id,
      contactId: contact.id,
      quoteNumber: (maxQ._max.quoteNumber ?? 0) + 1,
      title: MARKER,
      status: "APPROVED",
      subtotal: 385,
      total: 385,
      sentAt: new Date(Date.now() - 3 * 86400_000),
      approvedAt: new Date(),
      signatureName: `${contact.firstName} ${contact.lastName}`,
      lineItems: {
        create: [
          { name: "Gutter cleaning", description: "Full perimeter, downspouts flushed", quantity: 1, unitPrice: 245, total: 245, sortOrder: 0 },
          { name: "Roof debris removal", description: "", quantity: 1, unitPrice: 140, total: 140, sortOrder: 1 },
        ],
      },
    },
    select: { id: true, publicToken: true, quoteNumber: true },
  });

  const invoice = await prisma.invoice.create({
    data: {
      companyId: demo.id,
      contactId: contact.id,
      invoiceNumber: (maxI._max.invoiceNumber ?? 0) + 1,
      subject: MARKER,
      status: "PAID",
      subtotal: 385,
      total: 385,
      issuedAt: new Date(Date.now() - 3 * 86400_000),
      dueDate: new Date(Date.now() + 11 * 86400_000),
      paidAt: new Date(),
      lineItems: {
        create: [
          { name: "Gutter cleaning", description: "Full perimeter, downspouts flushed", quantity: 1, unitPrice: 245, total: 245, sortOrder: 0 },
          { name: "Roof debris removal", description: "", quantity: 1, unitPrice: 140, total: 140, sortOrder: 1 },
        ],
      },
      payments: {
        create: [
          { companyId: demo.id, contactId: contact.id, amount: 385, method: "CHECK", paidAt: new Date() },
        ],
      },
    },
    select: { id: true, publicToken: true, invoiceNumber: true },
  });

  console.log(JSON.stringify({ company: demo.name, quote, invoice }, null, 2));
} else if (mode === "cleanup") {
  const quotes = await prisma.quote.findMany({
    where: { companyId: demo.id, title: MARKER },
    select: { id: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: { companyId: demo.id, subject: MARKER },
    select: { id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  const quoteIds = quotes.map((q) => q.id);
  await prisma.quoteLineItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
  await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
  console.log(JSON.stringify({ deletedQuotes: quoteIds.length, deletedInvoices: invoiceIds.length }));
} else {
  throw new Error("Usage: seed-stamp-check.mts create|cleanup");
}
await prisma.$disconnect();
