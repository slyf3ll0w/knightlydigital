import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { isWorkBenchPayment, listSquarePayments, sellerFailureStatus } from "@/lib/square-seller-reports";

/**
 * GET /api/app/payments/square/transactions?cursor=&from=&to=
 * Every payment the seller's Square account took in the window (ListPayments,
 * PAYMENTS_READ), newest first, 100 per page by Square's cursor. Each row
 * says whether WorkBench took it (`workbench`) and, when it did, which
 * Payment row recorded it — the rest are POS / Square Online / Invoices
 * sales to record on an invoice from the Payments tab.
 * Seller token read live, never cached; Square down = 424.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (getProcessor().name !== "square") {
    return NextResponse.json({ error: "Square isn't the payment processor." }, { status: 400 });
  }
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ? new Date(sp.get("from") as string) : undefined;
  const to = sp.get("to") ? new Date(sp.get("to") as string) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return NextResponse.json({ error: "from/to must be ISO dates." }, { status: 400 });
  }

  const read = await listSquarePayments(actor.companyId, { beginTime: from, endTime: to, cursor: sp.get("cursor") });
  if (!read.ok) {
    const { status, body } = sellerFailureStatus(read);
    return NextResponse.json(body, { status });
  }
  const ids = read.data.payments.map((p) => p.id);
  const recorded = ids.length
    ? await prisma.payment.findMany({
        where: { companyId: actor.companyId, processorRef: { in: ids } },
        select: { id: true, processorRef: true, invoiceId: true },
      })
    : [];
  const byRef = new Map(recorded.map((r) => [r.processorRef as string, r]));
  const recordedIds = new Set(byRef.keys());
  return NextResponse.json({
    payments: read.data.payments.map((p) => {
      const rec = byRef.get(p.id);
      return { ...p, workbench: isWorkBenchPayment(p, recordedIds), paymentId: rec?.id ?? null, invoiceId: rec?.invoiceId ?? null };
    }),
    cursor: read.data.cursor,
  });
}
