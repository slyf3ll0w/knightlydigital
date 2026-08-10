import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["DRAFT", "AWAITING_PAYMENT", "PAID", "PAST_DUE", "ARCHIVED"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: { payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const covered = paid > 0 && paid >= Number(invoice.total) - 0.005;

  if (status === "PAID" && !covered) {
    return NextResponse.json(
      { error: "Recorded payments don't cover this invoice. Use Collect Payment to record the payment instead." },
      { status: 409 }
    );
  }
  // Archiving is exempt from the coverage check — shelving a paid-off (or
  // partly paid) invoice keeps its payments; only live-status flips must
  // stay consistent with the money recorded.
  if (status !== "PAID" && status !== "ARCHIVED" && covered) {
    return NextResponse.json(
      { error: "This invoice is fully covered by recorded payments. Remove or refund a payment to re-open it." },
      { status: 409 }
    );
  }
  // Reopening an archived invoice lands on the state its payments imply.
  if (invoice.status === "ARCHIVED" && status !== "ARCHIVED" && covered && status !== "PAID") {
    return NextResponse.json(
      { error: "This invoice is fully covered by recorded payments — reopen it as Paid." },
      { status: 409 }
    );
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      status,
      ...(status === "AWAITING_PAYMENT" && !invoice.issuedAt && { issuedAt: new Date() }),
      // Archiving shelves the invoice as-is (a paid one keeps its paidAt);
      // live-status flips derive paidAt from the new state.
      ...(status === "ARCHIVED"
        ? {}
        : status === "PAID"
          ? { paidAt: new Date() }
          : { paidAt: null }),
    },
  });
  if (status !== "PAID" && status !== "ARCHIVED") {
    // Un-paying clears everyone's seen-it rows so a genuine re-payment
    // celebrates again for the whole team
    await prisma.celebrationSeen.deleteMany({
      where: { kind: "INVOICE_PAID", entityId: id },
    });
  }

  logActivity({
    companyId,
    userId: actor.id,
    userName: actor.name,
    entityType: "invoice",
    entityId: id,
    action: "status_changed",
    detail: `${invoice.status} → ${status}`,
  });

  return NextResponse.json({ success: true });
}
