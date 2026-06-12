import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * DELETE — permanently remove an invoice (managers only). Recorded payments
 * cascade with it (they change revenue history), so the UI requires an
 * explicit force flag when any exist.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: actor.companyId },
    include: { _count: { select: { payments: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (invoice._count.payments > 0 && !force) {
    return NextResponse.json(
      { error: "This invoice has recorded payments — deleting it removes them too." },
      { status: 400 }
    );
  }

  // line items + reminders cascade; payments deliberately don't (money
  // records never vanish implicitly) — remove them explicitly
  try {
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { invoiceId: invoice.id } }),
      prisma.invoice.delete({ where: { id: invoice.id } }),
    ]);
  } catch (e) {
    console.error("[invoice delete] failed", { invoiceId: invoice.id, error: e });
    return NextResponse.json({ error: "Couldn't delete this invoice. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
