import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { notifyUsers, companyManagerIds, PushPayload } from "@/lib/push";

/**
 * POST — view beacon for the public client pages (/quote, /pay, /contract,
 * /hub). Stamps first/last viewed + a view count on the document; the FIRST
 * view also pushes the company's managers (plus the client's assigned
 * salesperson) so "the client just opened your quote" lands on their phone.
 *
 * Fired from <ViewBeacon> after the page is actually visible, which filters
 * out email link-scanner prefetches. Views from a logged-in session of the
 * document's own company (staff previewing) are ignored here. The response
 * is always 200 {ok:true} — this endpoint must never teach a caller which
 * tokens exist.
 */
export async function POST(req: NextRequest) {
  let kind = "";
  let token = "";
  try {
    const body = await req.json();
    kind = typeof body?.kind === "string" ? body.kind : "";
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    /* fall through to the bland OK */
  }
  const ok = NextResponse.json({ ok: true });
  if (!["quote", "invoice", "contract", "hub"].includes(kind)) return ok;
  if (!token || token.length > 64) return ok;

  // Staff previewing their own documents shouldn't read as a client open
  const actor = await getActor().catch(() => null);
  const now = new Date();

  try {
    if (kind === "hub") {
      const contact = await prisma.contact.findUnique({
        where: { hubToken: token },
        select: { id: true, companyId: true },
      });
      if (!contact || actor?.companyId === contact.companyId) return ok;
      await prisma.contact.update({
        where: { id: contact.id },
        data: { hubLastVisitAt: now },
      });
      return ok;
    }

    let firstView = false;
    let companyId = "";
    let assignedToId: string | null = null;
    let push: PushPayload | null = null;

    if (kind === "quote") {
      const quote = await prisma.quote.findUnique({
        where: { publicToken: token },
        select: {
          id: true,
          companyId: true,
          quoteNumber: true,
          firstViewedAt: true,
          contact: { select: { firstName: true, lastName: true, assignedToId: true } },
        },
      });
      if (!quote || actor?.companyId === quote.companyId) return ok;
      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: now,
          ...(quote.firstViewedAt ? {} : { firstViewedAt: now }),
        },
      });
      firstView = !quote.firstViewedAt;
      companyId = quote.companyId;
      assignedToId = quote.contact.assignedToId;
      push = {
        title: `${clientName(quote.contact)} viewed Quote #${quote.quoteNumber}`,
        body: "Opened just now — a good time to follow up.",
        url: `/app/quotes/${quote.id}`,
        tag: `doc-view-quote-${quote.id}`,
      };
    } else if (kind === "invoice") {
      const invoice = await prisma.invoice.findUnique({
        where: { publicToken: token },
        select: {
          id: true,
          companyId: true,
          invoiceNumber: true,
          firstViewedAt: true,
          contact: { select: { firstName: true, lastName: true, assignedToId: true } },
        },
      });
      if (!invoice || actor?.companyId === invoice.companyId) return ok;
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: now,
          ...(invoice.firstViewedAt ? {} : { firstViewedAt: now }),
        },
      });
      firstView = !invoice.firstViewedAt;
      companyId = invoice.companyId;
      assignedToId = invoice.contact?.assignedToId ?? null;
      push = {
        title: `${clientName(invoice.contact)} viewed Invoice #${invoice.invoiceNumber}`,
        body: "Opened just now.",
        url: `/app/invoices/${invoice.id}`,
        tag: `doc-view-invoice-${invoice.id}`,
      };
    } else {
      const contract = await prisma.contract.findUnique({
        where: { publicToken: token },
        select: {
          id: true,
          companyId: true,
          title: true,
          firstViewedAt: true,
          contact: { select: { firstName: true, lastName: true, assignedToId: true } },
        },
      });
      if (!contract || actor?.companyId === contract.companyId) return ok;
      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: now,
          ...(contract.firstViewedAt ? {} : { firstViewedAt: now }),
        },
      });
      firstView = !contract.firstViewedAt;
      companyId = contract.companyId;
      assignedToId = contract.contact.assignedToId;
      push = {
        title: `${clientName(contract.contact)} viewed "${contract.title}"`,
        body: "Agreement opened just now.",
        url: `/app/contracts/${contract.id}`,
        tag: `doc-view-contract-${contract.id}`,
      };
    }

    // Only the FIRST open notifies — refreshes and re-reads stay quiet
    if (firstView && push) {
      const ids = new Set(await companyManagerIds(companyId));
      if (assignedToId && !ids.has(assignedToId)) {
        const rep = await prisma.user.findFirst({
          where: { id: assignedToId, companyId, isActive: true },
          select: { id: true },
        });
        if (rep) ids.add(rep.id);
      }
      await notifyUsers([...ids], push);
    }
  } catch (err) {
    console.error("[viewed] beacon failed:", err);
  }
  return ok;
}

function clientName(contact: { firstName: string; lastName: string } | null): string {
  const name = contact ? `${contact.firstName} ${contact.lastName}`.trim() : "";
  return name || "A client";
}
