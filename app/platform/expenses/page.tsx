import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ExpensesClient from "./ExpensesClient";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const [expenses, recurring] = await Promise.all([
    prisma.expense.findMany({
      where: { companyId: actor.companyId },
      orderBy: { incurredAt: "desc" },
      take: 200,
    }),
    prisma.recurringExpense.findMany({
      where: { companyId: actor.companyId },
      orderBy: { dayOfMonth: "asc" },
    }),
  ]);

  return (
    <ExpensesClient
      expenses={expenses.map((e) => ({
        id: e.id,
        description: e.description,
        category: e.category,
        amount: Number(e.amount),
        incurredAt: e.incurredAt.toISOString().slice(0, 10),
      }))}
      recurring={recurring.map((r) => ({
        id: r.id,
        description: r.description,
        category: r.category,
        amount: Number(r.amount),
        dayOfMonth: r.dayOfMonth,
        nextRunDate: r.nextRunDate.toISOString().slice(0, 10),
        active: r.active,
      }))}
    />
  );
}
