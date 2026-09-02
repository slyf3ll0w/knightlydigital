import { prisma } from "../db";
import { isManager } from "../permissions";
import { type Tool, str, num, money, clientName, stage } from "./core";

/**
 * One permanent-delete tool for every entity (managers only) — each staging a
 * red danger card to the entity's own DELETE route. Kept separate from the
 * update tools so destructive intent is always an explicit, unmergeable card.
 */
export const deleteTools: Tool[] = [
  {
    decl: {
      name: "delete_record",
      description:
        "Stage PERMANENTLY deleting a record (managers only). entity + its id — for quote/invoice/job/request use the NUMBER as the id; for client/appointment/agreement/payment/expense/service/time_entry/time_block/address/person use the record id. Deletion is a last resort: suggest archiving (clients/quotes/jobs/requests) or cancelling (appointments, subscriptions) instead when the user's goal is just to hide something. Deleting a client destroys ALL their history; the card makes the user type the client's name to confirm. Always a red confirmation card.",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: ["client", "request", "quote", "invoice", "job", "appointment", "agreement", "payment", "expense", "service", "time_entry", "time_block", "address", "person"],
          },
          id: { type: "string", description: "record id, or the quote/invoice/job/request number" },
        },
        required: ["entity", "id"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const entity = str(args.entity, 15);
      const idArg = str(args.id, 40);
      const n = num(args.id);
      const companyId = actor.companyId;
      const gone = "This cannot be undone.";

      switch (entity) {
        case "client": {
          const contact = await prisma.contact.findFirst({
            where: { id: idArg, companyId },
            select: {
              id: true, firstName: true, lastName: true, companyName: true,
              _count: {
                select: {
                  quotes: true, jobs: true, invoices: true, payments: true,
                  appointments: true, subscriptions: true, contracts: true, requests: true,
                },
              },
            },
          });
          if (!contact) return { error: "No client with that id." };
          const c = contact._count;
          const hasWork =
            c.quotes + c.jobs + c.invoices + c.payments + c.appointments + c.subscriptions + c.contracts > 0;
          const name = `${contact.firstName} ${contact.lastName}`.trim();
          const destroyed = [
            c.quotes && `${c.quotes} quote(s)`,
            c.jobs && `${c.jobs} job(s)`,
            c.invoices && `${c.invoices} invoice(s)`,
            c.payments && `${c.payments} payment record(s)`,
            c.appointments && `${c.appointments} appointment(s)`,
            c.subscriptions && `${c.subscriptions} subscription(s)`,
            c.contracts && `${c.contracts} agreement(s)`,
            c.requests && `${c.requests} request(s)`,
          ].filter(Boolean) as string[];
          return stage(ctx, {
            kind: "delete_client",
            title: `Permanently delete ${clientName(contact)}`,
            lines: hasWork
              ? [`This DESTROYS: ${destroyed.join(", ")}.`, gone]
              : ["No work history — just the contact record is removed.", gone],
            endpoint: `/api/app/contacts/${contact.id}${hasWork ? "?force=1" : ""}`,
            method: "DELETE",
            payload: {},
            danger: true,
            ...(hasWork ? { confirmText: name } : {}),
          });
        }
        case "request": {
          const r = await prisma.request.findFirst({
            where: { companyId, requestNumber: n ?? -1 },
            select: {
              id: true, title: true,
              _count: { select: { quotes: true, jobs: true } },
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!r) return { error: `No request #${n}.` };
          if (r._count.quotes + r._count.jobs > 0) {
            return { error: `Request #${n} has linked quotes/jobs — it can't be deleted, only archived (update_request).` };
          }
          return stage(ctx, {
            kind: "delete_request",
            title: `Permanently delete request #${n} (${r.title})`,
            lines: [`Client: ${clientName(r.contact)}`, gone],
            endpoint: `/api/app/requests/${r.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "quote": {
          const q = await prisma.quote.findFirst({
            where: { companyId, quoteNumber: n ?? -1 },
            select: {
              id: true, status: true, total: true,
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!q) return { error: `No quote #${n}.` };
          return stage(ctx, {
            kind: "delete_quote",
            title: `Permanently delete quote #${n} — ${money(q.total)}`,
            lines: [
              `Client: ${clientName(q.contact)}`,
              ...(q.status === "CONVERTED" ? ["The job it became stays."] : []),
              gone,
            ],
            endpoint: `/api/app/quotes/${q.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "invoice": {
          const i = await prisma.invoice.findFirst({
            where: { companyId, invoiceNumber: n ?? -1 },
            select: {
              id: true, total: true,
              payments: { select: { amount: true } },
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!i) return { error: `No invoice #${n}.` };
          const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
          const hasPayments = i.payments.length > 0;
          return stage(ctx, {
            kind: "delete_invoice",
            title: `Permanently delete invoice #${n} — ${money(i.total)}`,
            lines: [
              i.contact ? `Client: ${clientName(i.contact)}` : null,
              hasPayments
                ? `Also deletes ${i.payments.length} recorded payment(s) totaling ${money(paid)} — revenue history changes.`
                : null,
              gone,
            ].filter(Boolean) as string[],
            endpoint: `/api/app/invoices/${i.id}${hasPayments ? "?force=1" : ""}`,
            method: "DELETE",
            payload: {},
            danger: true,
            ...(hasPayments ? { confirmText: "DELETE" } : {}),
          });
        }
        case "job": {
          const j = await prisma.job.findFirst({
            where: { companyId, jobNumber: n ?? -1 },
            select: {
              id: true, title: true,
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!j) return { error: `No job #${n}.` };
          return stage(ctx, {
            kind: "delete_job",
            title: `Permanently delete job #${n} (${j.title})`,
            lines: [
              `Client: ${clientName(j.contact)}`,
              "Any invoice survives (unlinked); a converted quote reopens as Approved. Notes and photos are destroyed.",
              gone,
            ],
            endpoint: `/api/app/jobs/${j.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "appointment": {
          const a = await prisma.appointment.findFirst({
            where: { id: idArg, companyId },
            select: {
              id: true, title: true,
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!a) return { error: "No appointment with that id." };
          return stage(ctx, {
            kind: "delete_appointment",
            title: `Permanently delete appointment "${a.title}"`,
            lines: [`Client: ${clientName(a.contact)}`, "Prefer cancel_appointment to keep the record.", gone],
            endpoint: `/api/app/appointments/${a.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "agreement": {
          const k = await prisma.contract.findFirst({
            where: { id: idArg, companyId },
            select: {
              id: true, title: true, status: true,
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!k) return { error: "No agreement with that id — check list_agreements." };
          return stage(ctx, {
            kind: "delete_agreement",
            title: `Permanently delete agreement "${k.title}"`,
            lines: [
              `Client: ${clientName(k.contact)}`,
              ...(k.status === "SIGNED" ? ["This agreement is SIGNED — deleting destroys the signature record. Prefer voiding (update_agreement)."] : []),
              gone,
            ],
            endpoint: `/api/app/contracts/${k.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
            ...(k.status === "SIGNED" ? { confirmText: "DELETE" } : {}),
          });
        }
        case "payment": {
          const p = await prisma.payment.findFirst({
            where: { id: idArg, companyId },
            select: {
              id: true, amount: true, method: true, paidAt: true, processorRef: true,
              invoice: { select: { invoiceNumber: true } },
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          });
          if (!p) return { error: "No payment with that id — check list_money (kind: payments)." };
          // An online charge still holding money is refunded, not deleted —
          // the API refuses it, so don't put a card in front of the user that
          // can't go through. (Once refunded to zero, deleting is allowed.)
          if (p.processorRef?.startsWith("TR") && Number(p.amount) > 0.005) {
            return {
              error:
                "That payment was processed online, so deleting it would erase the charge record without returning the client's money. Tell the user to refund it from invoice #" +
                p.invoice.invoiceNumber +
                " (/app/invoices) or the Payments page (/app/payments) — the refund button sends the money back to their card or bank.",
            };
          }
          return stage(ctx, {
            kind: "delete_payment",
            title: `Remove ${money(p.amount)} ${p.method.replace("_", " ")} payment from invoice #${p.invoice.invoiceNumber}`,
            lines: [
              p.contact ? `Client: ${clientName(p.contact)}` : null,
              `Recorded: ${p.paidAt.toISOString().slice(0, 10)}`,
              "The invoice goes back to unpaid/awaiting for this amount. This changes revenue history.",
            ].filter(Boolean) as string[],
            endpoint: `/api/app/payments/${p.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "expense": {
          const e = await prisma.expense.findFirst({
            where: { id: idArg, companyId },
            select: { id: true, description: true, amount: true, incurredAt: true },
          });
          if (!e) return { error: "No expense with that id — check list_expenses." };
          return stage(ctx, {
            kind: "delete_expense",
            title: `Delete expense: ${e.description} — ${money(e.amount)}`,
            lines: [`Recorded: ${e.incurredAt.toISOString().slice(0, 10)}`, gone],
            endpoint: `/api/app/expenses/${e.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "service": {
          const w = await prisma.workItem.findFirst({
            where: { id: idArg, companyId },
            select: { id: true, name: true, unitPrice: true },
          });
          if (!w) return { error: "No price-book item with that id — check get_price_book." };
          return stage(ctx, {
            kind: "delete_service",
            title: `Delete "${w.name}" (${money(w.unitPrice)}) from the price book`,
            lines: ["Existing quotes/jobs/invoices keep their line items.", gone],
            endpoint: `/api/app/work-items/${w.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
          });
        }
        case "time_entry": {
          const t = await prisma.timeEntry.findFirst({
            where: { id: idArg, companyId },
            select: { id: true, startedAt: true, endedAt: true, user: { select: { name: true } }, job: { select: { jobNumber: true } } },
          });
          if (!t) return { error: "No time entry with that id — check query_records entity time_entries." };
          const hrs = Math.round((((t.endedAt ?? new Date()).getTime() - t.startedAt.getTime()) / 3_600_000) * 100) / 100;
          return stage(ctx, {
            kind: "delete_time_entry",
            title: `Delete ${t.user.name}'s ${hrs} h time entry${t.job ? ` on job #${t.job.jobNumber}` : ""}`,
            lines: [`Started: ${t.startedAt.toISOString().slice(0, 10)}`, "Labor cost and timesheets change.", gone],
            endpoint: `/api/app/time-entries/${t.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
            confirmLabel: "Delete entry",
          });
        }
        case "time_block": {
          const b = await prisma.timeBlock.findFirst({
            where: { id: idArg, companyId },
            select: { id: true, title: true, startAt: true, user: { select: { name: true } } },
          });
          if (!b) return { error: "No time block with that id — check manage_time_block list." };
          return stage(ctx, {
            kind: "delete_time_block",
            title: `Remove block "${b.title}" (${b.user?.name ?? "everyone"})`,
            lines: [`Starts: ${b.startAt.toISOString().slice(0, 10)}`],
            endpoint: `/api/app/time-blocks/${b.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
            confirmLabel: "Remove block",
          });
        }
        case "address": {
          const a = await prisma.contactAddress.findFirst({
            where: { id: idArg, contact: { companyId } },
            select: { id: true, label: true, address: true, contactId: true, _count: { select: { jobs: true, quotes: true, appointments: true } }, contact: { select: { firstName: true, lastName: true, companyName: true } } },
          });
          if (!a) return { error: "No saved address with that id — check get_client_details." };
          const linked = a._count.jobs + a._count.quotes + a._count.appointments;
          return stage(ctx, {
            kind: "delete_address",
            title: `Remove address "${a.label || a.address}" from ${clientName(a.contact)}`,
            lines: [linked ? `${linked} job(s)/quote(s)/appointment(s) lose their property link (the records stay).` : "Nothing is linked to it.", gone],
            endpoint: `/api/app/contacts/${a.contactId}/addresses/${a.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
            confirmLabel: "Remove address",
          });
        }
        case "person": {
          const p = await prisma.contactPerson.findFirst({
            where: { id: idArg, contact: { companyId } },
            select: { id: true, firstName: true, lastName: true, contactId: true, contact: { select: { firstName: true, lastName: true, companyName: true } } },
          });
          if (!p) return { error: "No additional person with that id — check get_client_details." };
          return stage(ctx, {
            kind: "delete_person",
            title: `Remove ${`${p.firstName} ${p.lastName}`.trim()} from ${clientName(p.contact)}`,
            lines: [gone],
            endpoint: `/api/app/contacts/${p.contactId}/people/${p.id}`,
            method: "DELETE",
            payload: {},
            danger: true,
            confirmLabel: "Remove person",
          });
        }
        default:
          return { error: "entity must be one of client, request, quote, invoice, job, appointment, agreement, payment, expense, service, time_entry, time_block, address, person." };
      }
    },
  },
];
