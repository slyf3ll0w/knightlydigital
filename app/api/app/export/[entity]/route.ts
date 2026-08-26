import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getActor,
  isManager,
  canSell,
  canSeeMoney,
  viaContactScope,
  jobScope,
  contactScope,
} from "@/lib/permissions";
import { csvCell, csvText, csvResponse } from "@/lib/csv";
import { invoiceBalance } from "@/lib/payments";
import { entryMs } from "@/lib/time-entries";

/**
 * GET /api/app/export/[entity] — one-click CSV export, the "your data is
 * yours" counterpart to the client importer. Row scopes mirror the list pages
 * (role scoping included), so an export never shows more than the screen does.
 *
 * Entities: clients | quotes | jobs | invoices | payments | timesheets
 * Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD narrows date-ranged entities
 * (payments, timesheets) by their natural date.
 */

const MAX_ROWS = 10000;

function parseDay(s: string | null, end = false): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T${end ? "23:59:59" : "00:00:00"}`);
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const num = (v: number | { toString(): string } | null | undefined) =>
  v == null ? "" : Number(v).toFixed(2);
const fullName = (c: { firstName: string; lastName: string } | null | undefined) =>
  c ? `${c.firstName} ${c.lastName}`.trim() : "";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = actor.companyId;
  const { entity } = await params;
  const from = parseDay(req.nextUrl.searchParams.get("from"));
  const to = parseDay(req.nextUrl.searchParams.get("to"), true);
  const range = (field: string) =>
    from || to
      ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {};
  const stamp = new Date().toISOString().slice(0, 10);

  switch (entity) {
    case "clients": {
      if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const rows = await prisma.contact.findMany({
        where: { companyId, ...contactScope(actor) },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
      });
      return csvResponse(
        `clients-${stamp}.csv`,
        ["First name", "Last name", "Company", "Email", "Phone", "Address", "City", "State", "ZIP", "Status", "Lead source", "Payment terms (days)", "Created"],
        rows.map((c) => [
          csvText(c.firstName),
          csvText(c.lastName),
          csvText(c.companyName ?? ""),
          csvText(c.email ?? ""),
          csvText(c.phone ?? ""),
          csvText(c.address ?? ""),
          csvText(c.city ?? ""),
          csvText(c.state ?? ""),
          csvText(c.zip ?? ""),
          csvCell(c.status),
          csvText(c.leadSource ?? ""),
          csvCell(String(c.paymentTermsDays)),
          csvCell(day(c.createdAt)),
        ])
      );
    }

    case "quotes": {
      if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const rows = await prisma.quote.findMany({
        where: { companyId, ...viaContactScope(actor) },
        include: { contact: { select: { firstName: true, lastName: true } } },
        orderBy: { quoteNumber: "asc" },
        take: MAX_ROWS,
      });
      return csvResponse(
        `quotes-${stamp}.csv`,
        ["Quote #", "Title", "Client", "Status", "Sent", "Approved", "Subtotal", "Discount", "Tax", "Total"],
        rows.map((q) => [
          csvCell(String(q.quoteNumber)),
          csvText(q.title ?? ""),
          csvText(fullName(q.contact)),
          csvCell(q.status),
          csvCell(day(q.sentAt)),
          csvCell(day(q.approvedAt)),
          csvCell(num(q.subtotal)),
          csvCell(num(q.discount)),
          csvCell(num(q.tax)),
          csvCell(num(q.total)),
        ])
      );
    }

    case "jobs": {
      // Techs export their own jobs, but the priced column follows the same
      // money gate as every other surface — the job pages hide prices from
      // roles without canSeeMoney, and the export must not show more.
      const seeMoney = canSeeMoney(actor);
      const rows = await prisma.job.findMany({
        where: { companyId, ...jobScope(actor) },
        include: {
          contact: { select: { firstName: true, lastName: true } },
          lineItems: { select: { total: true } },
        },
        orderBy: { jobNumber: "asc" },
        take: MAX_ROWS,
      });
      return csvResponse(
        `jobs-${stamp}.csv`,
        ["Job #", "Title", "Client", "Status", "Scheduled", "Address", ...(seeMoney ? ["Line-item total"] : []), "Created"],
        rows.map((j) => [
          csvCell(String(j.jobNumber)),
          csvText(j.title),
          csvText(fullName(j.contact)),
          csvCell(j.status),
          csvCell(j.scheduledAt ? j.scheduledAt.toISOString() : ""),
          csvText(j.address ?? ""),
          ...(seeMoney ? [csvCell(num(j.lineItems.reduce((s, li) => s + Number(li.total), 0)))] : []),
          csvCell(day(j.createdAt)),
        ])
      );
    }

    case "invoices": {
      if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const rows = await prisma.invoice.findMany({
        where: { companyId, ...viaContactScope(actor) },
        include: {
          contact: { select: { firstName: true, lastName: true } },
          payments: { select: { amount: true, surchargeAmount: true } },
        },
        orderBy: { invoiceNumber: "asc" },
        take: MAX_ROWS,
      });
      return csvResponse(
        `invoices-${stamp}.csv`,
        ["Invoice #", "Subject", "Client", "Kind", "Status", "Issued", "Due", "Paid at", "Subtotal", "Discount", "Tax", "Surcharge", "Deposit applied", "Total", "Paid", "Balance"],
        rows.map((i) => {
          const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
          const balance = Math.max(0, invoiceBalance(i));
          return [
            csvCell(String(i.invoiceNumber)),
            csvText(i.subject ?? ""),
            csvText(fullName(i.contact)),
            csvCell(i.kind),
            csvCell(i.status),
            csvCell(day(i.issuedAt)),
            csvCell(day(i.dueDate)),
            csvCell(day(i.paidAt)),
            csvCell(num(i.subtotal)),
            csvCell(num(i.discount)),
            csvCell(num(i.tax)),
            csvCell(num(i.surcharge)),
            csvCell(num(i.depositApplied)),
            csvCell(num(i.total)),
            csvCell(num(paid)),
            csvCell(num(balance)),
          ];
        })
      );
    }

    case "payments": {
      if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const rows = await prisma.payment.findMany({
        where: { companyId, ...range("paidAt") },
        include: {
          invoice: { select: { invoiceNumber: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
        orderBy: { paidAt: "asc" },
        take: MAX_ROWS,
      });
      return csvResponse(
        `payments-${stamp}.csv`,
        ["Date", "Invoice #", "Client", "Method", "Amount", "Surcharge included", "Reference #", "Details", "Processor ref"],
        rows.map((p) => [
          csvCell(day(p.paidAt)),
          csvCell(String(p.invoice.invoiceNumber)),
          csvText(fullName(p.contact)),
          csvCell(p.method),
          csvCell(num(p.amount)),
          csvCell(num(p.surchargeAmount)),
          csvText(p.referenceNumber ?? ""),
          csvText(p.details ?? ""),
          csvCell(p.processorRef ?? ""),
        ])
      );
    }

    case "timesheets": {
      // Managers export everyone; everyone else their own hours.
      const rows = await prisma.timeEntry.findMany({
        where: {
          companyId,
          ...(isManager(actor.role) ? {} : { userId: actor.id }),
          ...range("startedAt"),
        },
        include: {
          user: { select: { name: true, email: true } },
          job: { select: { jobNumber: true, title: true } },
        },
        orderBy: { startedAt: "asc" },
        take: MAX_ROWS,
      });
      return csvResponse(
        `timesheets-${stamp}.csv`,
        ["Team member", "Job #", "Job", "Started", "Ended", "Hours", "Source", "Note"],
        rows.map((t) => [
          csvText(t.user?.name || t.user?.email || ""),
          csvCell(t.job ? String(t.job.jobNumber) : ""),
          csvText(t.job?.title ?? ""),
          csvCell(t.startedAt.toISOString()),
          csvCell(t.endedAt ? t.endedAt.toISOString() : ""),
          csvCell((entryMs(t) / 3600000).toFixed(2)),
          csvCell(t.source),
          csvText(t.note ?? ""),
        ])
      );
    }

    default:
      return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }
}
