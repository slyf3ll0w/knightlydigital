// Temp verification helper: print one quote + one invoice public token from
// the demo company (fall back to any) so the redesigned public pages can be
// screenshot-checked with ?preview=1. Run via:
//   npx -y @railway/cli run --service Postgres npx tsx scripts/get-doc-tokens.mts
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const demo = await prisma.company.findFirst({
  where: { slug: { contains: "demo" } },
  select: { id: true, name: true, slug: true },
});
const companyFilter = demo ? { companyId: demo.id } : {};

async function pick(where: object) {
  const quote = await prisma.quote.findFirst({
    where: { ...where, status: { in: ["AWAITING_RESPONSE", "DRAFT", "CHANGES_REQUESTED"] } },
    orderBy: { createdAt: "desc" },
    select: { publicToken: true, quoteNumber: true, status: true, companyId: true },
  });
  const invoice = await prisma.invoice.findFirst({
    where: { ...where, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
    orderBy: { createdAt: "desc" },
    select: { publicToken: true, invoiceNumber: true, status: true, companyId: true },
  });
  return { quote, invoice };
}

let result = await pick(companyFilter);
// Demo co may have nothing open — any company works; preview=1 never marks
// the document viewed and nothing is clicked.
if (!result.quote && !result.invoice) result = await pick({});
console.log(JSON.stringify({ company: demo?.name ?? "(any)", ...result }, null, 2));
await prisma.$disconnect();
