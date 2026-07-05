/**
 * One-off cleanup: delete a company and all of its data by slug.
 * Run with: DATABASE_URL=<public proxy url> node scripts/delete-test-company.mjs <slug>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const slug = process.argv[2];
if (!slug) {
  console.error("Usage: node scripts/delete-test-company.mjs <company-slug>");
  process.exit(1);
}

const company = await prisma.company.findUnique({ where: { slug } });
if (!company) {
  console.error(`No company found with slug "${slug}"`);
  process.exit(1);
}
console.log(`Deleting "${company.name}" (${company.id})...`);

const companyId = company.id;

// Children first, then parents — schema has no onDelete cascades.
const jobIds = (await prisma.job.findMany({ where: { companyId }, select: { id: true } })).map((j) => j.id);
const quoteIds = (await prisma.quote.findMany({ where: { companyId }, select: { id: true } })).map((q) => q.id);
const invoiceIds = (await prisma.invoice.findMany({ where: { companyId }, select: { id: true } })).map((i) => i.id);

await prisma.jobLineItem.deleteMany({ where: { jobId: { in: jobIds } } });
await prisma.jobAssignment.deleteMany({ where: { jobId: { in: jobIds } } });
await prisma.jobNote.deleteMany({ where: { jobId: { in: jobIds } } });
await prisma.jobPhoto.deleteMany({ where: { jobId: { in: jobIds } } });
await prisma.quoteLineItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
await prisma.paymentReminder.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
await prisma.payment.deleteMany({ where: { companyId } });
await prisma.invoice.deleteMany({ where: { companyId } });
await prisma.job.deleteMany({ where: { companyId } });
await prisma.quote.deleteMany({ where: { companyId } });
await prisma.request.deleteMany({ where: { companyId } });
await prisma.reviewRequest.deleteMany({ where: { companyId } });
await prisma.bookingRequest.deleteMany({ where: { companyId } });
await prisma.appointment.deleteMany({ where: { companyId } });
await prisma.subscription.deleteMany({ where: { companyId } });
await prisma.servicePlan.deleteMany({ where: { companyId } });
await prisma.expense.deleteMany({ where: { companyId } });
await prisma.contract.deleteMany({ where: { companyId } });
await prisma.contractTemplate.deleteMany({ where: { companyId } });
const contactIds = (await prisma.contact.findMany({ where: { companyId }, select: { id: true } })).map((c) => c.id);
await prisma.contactNote.deleteMany({ where: { contactId: { in: contactIds } } });
await prisma.contact.deleteMany({ where: { companyId } });
await prisma.contactFieldDef.deleteMany({ where: { companyId } });
await prisma.webForm.deleteMany({ where: { companyId } });
await prisma.workItem.deleteMany({ where: { companyId } });
await prisma.user.deleteMany({ where: { companyId } });
await prisma.company.delete({ where: { id: companyId } });

console.log("Done — company and all related data removed.");
await prisma.$disconnect();
