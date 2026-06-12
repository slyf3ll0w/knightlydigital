import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * Business expenses (owners/admins only).
 * GET            — list (optional ?from=YYYY-MM-DD&to=YYYY-MM-DD)
 * GET&format=csv — download the range as a CSV
 * POST           — log a transaction { description, category?, amount, incurredAt }
 */

function parseDay(s: string | null, end = false): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T${end ? "23:59:59" : "00:00:00"}`);
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const from = parseDay(req.nextUrl.searchParams.get("from"));
  const to = parseDay(req.nextUrl.searchParams.get("to"), true);

  const expenses = await prisma.expense.findMany({
    where: {
      companyId: actor.companyId,
      ...(from || to
        ? { incurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { incurredAt: "desc" },
    take: 1000,
  });

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const rows = [
      ["Date", "Description", "Category", "Amount"],
      ...expenses.map((e) => [
        e.incurredAt.toISOString().slice(0, 10),
        e.description,
        e.category ?? "",
        Number(e.amount).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="expenses-${req.nextUrl.searchParams.get("from") ?? "all"}-to-${req.nextUrl.searchParams.get("to") ?? "now"}.csv"`,
      },
    });
  }

  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 200) : "";
  const amount = Number(body.amount);
  const incurredAt =
    typeof body.incurredAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.incurredAt)
      ? new Date(`${body.incurredAt}T12:00:00`)
      : null;

  if (!description) return NextResponse.json({ error: "A description is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a positive amount." }, { status: 400 });
  }
  if (!incurredAt) return NextResponse.json({ error: "Pick the transaction date." }, { status: 400 });

  const expense = await prisma.expense.create({
    data: {
      companyId: actor.companyId,
      description,
      category: typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 60) : null,
      amount: Math.round(amount * 100) / 100,
      incurredAt,
      createdById: actor.id,
    },
  });
  return NextResponse.json(expense, { status: 201 });
}
