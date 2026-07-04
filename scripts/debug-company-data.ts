/** One-off audit: per-company quote/expense/contact counts (debugging assistant "sees nothing"). */
import { prisma } from "../lib/db";

(async () => {
  const cos = await prisma.company.findMany({
    select: { id: true, name: true, slug: true, users: { select: { email: true, role: true } } },
  });
  for (const c of cos) {
    const [q, e, x] = await Promise.all([
      prisma.quote.groupBy({ by: ["status"], where: { companyId: c.id }, _count: true }),
      prisma.expense.count({ where: { companyId: c.id } }),
      prisma.contact.count({ where: { companyId: c.id } }),
    ]);
    console.log(c.slug, "| users:", c.users.map((u) => `${u.email}:${u.role}`).join(", "));
    console.log("  quotes:", JSON.stringify(q), "| expenses:", e, "| contacts:", x);
  }
  await prisma.$disconnect();
})();
