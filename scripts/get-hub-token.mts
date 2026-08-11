// Temp: print a hub token for a demo-company contact (hub payment-method verify)
process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const contact = await prisma.contact.findFirst({
  where: { company: { finixOnboardingState: "APPROVED", slug: { contains: "demo" } } },
  orderBy: { createdAt: "asc" },
  select: { id: true, firstName: true, lastName: true, hubToken: true, company: { select: { name: true, slug: true } } },
});
console.log(JSON.stringify(contact, null, 2));
await prisma.$disconnect();
