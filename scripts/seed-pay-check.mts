// Temp verification helper for the /pay terminal ritual: seeds one small
// open invoice for the demo contact (whose company is sandbox-APPROVED),
// prints the pay token, and cleans it (and any sandbox payment) up again.
//   npx -y @railway/cli run --service Postgres npx tsx scripts/seed-pay-check.mts create
//   npx -y @railway/cli run --service Postgres npx tsx scripts/seed-pay-check.mts cleanup
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const MARKER = "Pay ritual check (temp)";
const mode = process.argv[2];

const contact = await prisma.contact.findFirst({
  where: { company: { finixOnboardingState: "APPROVED", slug: { contains: "demo" } } },
  orderBy: { createdAt: "asc" },
  select: { id: true, companyId: true, firstName: true, lastName: true, email: true },
});
if (!contact) throw new Error("No demo contact in an approved company");

if (mode === "create") {
  const maxI = await prisma.invoice.aggregate({
    where: { companyId: contact.companyId },
    _max: { invoiceNumber: true },
  });
  const invoice = await prisma.invoice.create({
    data: {
      companyId: contact.companyId,
      contactId: contact.id,
      invoiceNumber: (maxI._max.invoiceNumber ?? 0) + 1,
      subject: MARKER,
      status: "AWAITING_PAYMENT",
      subtotal: 3,
      total: 3,
      issuedAt: new Date(),
      lineItems: {
        create: [{ name: "Service call", description: "", quantity: 1, unitPrice: 3, total: 3, sortOrder: 0 }],
      },
    },
    select: { id: true, publicToken: true, invoiceNumber: true },
  });
  console.log(JSON.stringify({ contact: `${contact.firstName} ${contact.lastName}`, email: contact.email, invoice }, null, 2));
} else if (mode === "cleanup") {
  const invoices = await prisma.invoice.findMany({
    where: { companyId: contact.companyId, subject: MARKER },
    select: { id: true },
  });
  const ids = invoices.map((i) => i.id);
  await prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
  console.log(JSON.stringify({ deletedInvoices: ids.length }));
} else {
  throw new Error("Usage: seed-pay-check.mts create|cleanup");
}
await prisma.$disconnect();
