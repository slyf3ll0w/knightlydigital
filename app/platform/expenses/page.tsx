import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ExpensesClient from "./ExpensesClient";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const expenses = await prisma.expense.findMany({
    where: { companyId: actor.companyId },
    orderBy: { incurredAt: "desc" },
    take: 200,
  });

  return (
    <ExpensesClient
      expenses={expenses.map((e) => ({
        id: e.id,
        description: e.description,
        category: e.category,
        amount: Number(e.amount),
        incurredAt: e.incurredAt.toISOString().slice(0, 10),
      }))}
    />
  );
}
