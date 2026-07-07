import { prisma } from "../db";
import {
  canSell,
  canSeeMoney,
  canSeePricing,
  jobScope,
  viaContactScope,
} from "../permissions";
import {
  type Tool,
  str,
  num,
  money,
  clientName,
  findContact,
  stage,
  parseLineItems,
  LINE_ITEMS_PARAM,
} from "./core";

/** Full-replace line-item payload for the quote/invoice/job PATCH routes.
 *  Both name and description are set so every list/display renders, and the
 *  price-book cost backfill (which matches on name) still works. */
export function itemsPayload(items: { description: string; quantity: number; unitPrice: number }[]) {
  return items.map((li) => ({
    name: li.description,
    description: li.description,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
  }));
}

/** Requests + quotes: pipeline reads, request lifecycle, booking approvals, quote CRUD. */
export const pipelineTools: Tool[] = [
  {
    decl: {
      name: "list_pipeline",
      description:
        "Recent requests, quotes, or jobs. Optional status filter — requests: NEW, NEEDS_APPROVAL, CONVERTED, ARCHIVED; quotes: DRAFT, AWAITING_RESPONSE, APPROVED, CHANGES_REQUESTED, CONVERTED; jobs: ACTIVE, REQUIRES_INVOICING, ARCHIVED (or 'unscheduled').",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["requests", "quotes", "jobs"] },
          status: { type: "string" },
        },
        required: ["kind"],
      },
    },
    allowed: () => true, // techs get jobs only; requests/quotes re-check inside
    run: async (actor, args) => {
      const status = str(args.status, 24);
      if (args.kind === "jobs") {
        const unscheduled = status.toLowerCase() === "unscheduled";
        const valid = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"];
        const rows = await prisma.job.findMany({
          where: {
            companyId: actor.companyId, ...jobScope(actor),
            status: valid.includes(status) ? (status as never) : unscheduled ? "ACTIVE" : { not: "ARCHIVED" },
            ...(unscheduled ? { scheduledAt: null } : {}),
          },
          take: 15, orderBy: { updatedAt: "desc" },
          select: {
            jobNumber: true, title: true, status: true, scheduledAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          jobs: rows.map((j) => ({
            n: j.jobNumber, title: j.title, status: j.status, client: clientName(j.contact),
            scheduled: j.scheduledAt?.toISOString().slice(0, 10) ?? "unscheduled",
          })),
        };
      }
      if (!canSell(actor.role)) return { error: "This user's role can't view requests/quotes." };
      if (args.kind === "requests") {
        const valid = ["NEW", "NEEDS_APPROVAL", "CONVERTED", "ARCHIVED"];
        const rows = await prisma.request.findMany({
          where: {
            companyId: actor.companyId, ...viaContactScope(actor),
            status: valid.includes(status) ? (status as never) : undefined,
          },
          take: 15, orderBy: { createdAt: "desc" },
          select: {
            requestNumber: true, title: true, status: true, createdAt: true, source: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          requests: rows.map((r) => ({
            n: r.requestNumber, title: r.title, status: r.status, source: r.source,
            client: clientName(r.contact), on: r.createdAt.toISOString().slice(0, 10),
          })),
        };
      }
      const valid = ["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "CONVERTED", "ARCHIVED"];
      const rows = await prisma.quote.findMany({
        where: {
          companyId: actor.companyId, ...viaContactScope(actor),
          status: valid.includes(status) ? (status as never) : undefined,
        },
        take: 15, orderBy: { updatedAt: "desc" },
        select: {
          quoteNumber: true, title: true, status: true, total: true, sentAt: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      const seePrices = canSeePricing(actor.role);
      return {
        quotes: rows.map((q) => ({
          n: q.quoteNumber, title: q.title, status: q.status, client: clientName(q.contact),
          ...(seePrices ? { total: money(q.total) } : {}),
          sent: q.sentAt?.toISOString().slice(0, 10),
        })),
      };
    },
  },
  {
    decl: {
      name: "get_document",
      description:
        "One quote, invoice, or job in full detail by its number — including every line item. ALWAYS call this before update_quote/update_invoice/update_job edits: edits replace ALL line items, so start from the current ones.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["quote", "invoice", "job"] },
          number: { type: "number" },
        },
        required: ["kind", "number"],
      },
    },
    allowed: () => true, // per-kind role checks inside
    run: async (actor, args) => {
      const n = num(args.number);
      if (!n) return { error: "number is required" };
      const seePrices = canSeePricing(actor.role);
      const itemText = (li: { name: string; description: string | null }) =>
        li.name || li.description || "";
      if (args.kind === "quote") {
        if (!canSell(actor.role)) return { error: "This user's role can't view quotes." };
        const q = await prisma.quote.findFirst({
          where: { companyId: actor.companyId, quoteNumber: n, ...viaContactScope(actor) },
          select: {
            quoteNumber: true, title: true, status: true, total: true, notes: true,
            clientMessage: true, discountType: true, discountValue: true, taxRate: true,
            depositType: true, depositValue: true, sentAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
            lineItems: {
              orderBy: { sortOrder: "asc" },
              select: { name: true, description: true, quantity: true, unitPrice: true, isOptional: true },
            },
          },
        });
        if (!q) return { error: `No quote #${n} (or not visible to this user).` };
        return {
          n: q.quoteNumber, title: q.title, status: q.status, client: clientName(q.contact),
          sent: q.sentAt?.toISOString().slice(0, 10),
          clientMessage: q.clientMessage, notes: q.notes,
          ...(seePrices
            ? {
                total: money(q.total),
                discount: q.discountType !== "NONE" ? `${q.discountType} ${q.discountValue}` : null,
                taxRate: q.taxRate ? Number(q.taxRate) : null,
                deposit: q.depositType !== "NONE" ? `${q.depositType} ${q.depositValue ?? ""}`.trim() : null,
                lineItems: q.lineItems.map((li) => ({
                  description: itemText(li), quantity: Number(li.quantity),
                  unitPrice: Number(li.unitPrice), ...(li.isOptional ? { optional: true } : {}),
                })),
              }
            : { lineItems: q.lineItems.map((li) => ({ description: itemText(li) })) }),
        };
      }
      if (args.kind === "invoice") {
        if (!canSeeMoney(actor)) return { error: "This user's role can't view invoices." };
        const i = await prisma.invoice.findFirst({
          where: { companyId: actor.companyId, invoiceNumber: n, ...viaContactScope(actor) },
          select: {
            invoiceNumber: true, subject: true, status: true, total: true, notes: true,
            discountType: true, discountValue: true, taxRate: true, dueDate: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
            payments: { select: { amount: true } },
            lineItems: {
              orderBy: { sortOrder: "asc" },
              select: { name: true, description: true, quantity: true, unitPrice: true },
            },
          },
        });
        if (!i) return { error: `No invoice #${n} (or not visible to this user).` };
        const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          n: i.invoiceNumber, subject: i.subject, status: i.status,
          client: i.contact ? clientName(i.contact) : null,
          total: money(i.total), paid: money(paid),
          due: i.dueDate?.toISOString().slice(0, 10), notes: i.notes,
          discount: i.discountType !== "NONE" ? `${i.discountType} ${i.discountValue}` : null,
          taxRate: i.taxRate ? Number(i.taxRate) : null,
          lineItems: i.lineItems.map((li) => ({
            description: itemText(li), quantity: Number(li.quantity), unitPrice: Number(li.unitPrice),
          })),
        };
      }
      const j = await prisma.job.findFirst({
        where: { companyId: actor.companyId, jobNumber: n, ...jobScope(actor) },
        select: {
          jobNumber: true, title: true, status: true, description: true, address: true,
          scheduledAt: true, scheduledAnytime: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          assignments: { select: { user: { select: { id: true, name: true } } } },
          lineItems: {
            orderBy: { sortOrder: "asc" },
            select: { name: true, description: true, quantity: true, unitPrice: true },
          },
          notes: {
            take: 3, orderBy: { createdAt: "desc" },
            select: { body: true, createdAt: true, user: { select: { name: true } } },
          },
        },
      });
      if (!j) return { error: `No job #${n} (or not visible to this user).` };
      return {
        n: j.jobNumber, title: j.title, status: j.status, client: clientName(j.contact),
        description: j.description, address: j.address,
        scheduled: j.scheduledAt?.toISOString() ?? "unscheduled",
        crew: j.assignments.map((x) => ({ memberId: x.user.id, name: x.user.name })),
        lineItems: j.lineItems.map((li) => ({
          description: itemText(li),
          ...(seePrices ? { quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) } : {}),
        })),
        recentNotes: j.notes.map((nt) => ({
          by: nt.user.name, on: nt.createdAt.toISOString().slice(0, 10), note: nt.body.slice(0, 200),
        })),
      };
    },
  },

  // ── requests ────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "create_request",
      description:
        "Stage a new work request (lead) for a client — the top of the pipeline, before a quote exists. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string", description: "What they want, e.g. 'Gutter cleaning'" },
          details: { type: "string" },
        },
        required: ["clientId", "title"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const title = str(args.title, 120);
      if (!title) return { error: "title is required" };
      const details = str(args.details, 2000);
      return stage(ctx, {
        kind: "create_request",
        title: `New request: ${title}`,
        lines: [`Client: ${clientName(contact)}`, details && `Details: ${details.slice(0, 150)}`].filter(
          Boolean
        ) as string[],
        endpoint: "/api/app/requests",
        method: "POST",
        payload: { contactId: contact.id, title, details: details || undefined },
      });
    },
  },
  {
    decl: {
      name: "update_request",
      description:
        "Stage editing a request (by request number): title, details, or status (ARCHIVED to close it, NEW to restore it). For approving/declining an online booking use respond_to_booking instead. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          requestNumber: { type: "number" },
          title: { type: "string" },
          details: { type: "string" },
          status: { type: "string", enum: ["NEW", "ARCHIVED"] },
        },
        required: ["requestNumber"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.requestNumber);
      const request = await prisma.request.findFirst({
        where: { companyId: actor.companyId, requestNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, title: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!request) return { error: `No request #${n} (or not visible to this user).` };
      if (request.status === "NEEDS_APPROVAL") {
        return { error: `Request #${n} is an online booking awaiting approval — use respond_to_booking.` };
      }
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const title = str(args.title, 150);
      if (title) {
        payload.title = title;
        lines.push(`Title: ${title}`);
      }
      const details = str(args.details, 2000);
      if (details) {
        payload.details = details;
        lines.push(`Details: ${details.slice(0, 150)}`);
      }
      const status = str(args.status, 12);
      if (status === "NEW" || status === "ARCHIVED") {
        payload.status = status;
        lines.push(status === "ARCHIVED" ? "Archive (reversible)" : "Restore to New");
      }
      if (lines.length === 0) return { error: "Nothing to change — provide title, details, or status." };
      return stage(ctx, {
        kind: "update_request",
        title: `Update request #${n} (${request.title})`,
        lines: [`Client: ${clientName(request.contact)}`, ...lines],
        endpoint: `/api/app/requests/${request.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "respond_to_booking",
      description:
        "Stage approving or declining an online booking that a client self-scheduled (requests with status NEEDS_APPROVAL — find them via list_pipeline or whats_needing_attention). Accept confirms the tentative appointment; decline archives the request and frees the slot. Either way the client is emailed the outcome once confirmed. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          requestNumber: { type: "number" },
          action: { type: "string", enum: ["accept", "decline"] },
        },
        required: ["requestNumber", "action"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.requestNumber);
      const action = str(args.action, 10);
      if (action !== "accept" && action !== "decline") return { error: "action must be accept or decline" };
      const request = await prisma.request.findFirst({
        where: { companyId: actor.companyId, requestNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, title: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, email: true } },
        },
      });
      if (!request) return { error: `No request #${n} (or not visible to this user).` };
      if (request.status !== "NEEDS_APPROVAL") {
        return { error: `Request #${n} is ${request.status} — only NEEDS_APPROVAL bookings can be accepted/declined.` };
      }
      return stage(ctx, {
        kind: "respond_to_booking",
        title: `${action === "accept" ? "Approve" : "Decline"} booking: ${request.title}`,
        lines: [
          `Client: ${clientName(request.contact)}`,
          action === "accept"
            ? "Confirms their tentative appointment on the schedule."
            : "Archives the request, cancels the tentative appointment, and frees the slot.",
          request.contact.email
            ? `Emails ${request.contact.email} the outcome.`
            : "Client has no email on file — no notification goes out.",
        ],
        endpoint: `/api/app/requests/${request.id}/booking`,
        method: "POST",
        payload: { action },
      });
    },
  },

  // ── quotes ──────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "create_quote",
      description:
        "Stage a draft quote for a client. Check get_price_book first so line items use real service names and prices. The quote is created as a DRAFT for the user to review and send. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string" },
          lineItems: LINE_ITEMS_PARAM,
        },
        required: ["clientId", "lineItems"],
      },
    },
    allowed: (a) => canSell(a.role) && canSeePricing(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const lineItems = parseLineItems(args.lineItems);
      if (lineItems.length === 0) return { error: "At least one line item with a description is required." };
      const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      return stage(ctx, {
        kind: "create_quote",
        title: `Draft quote for ${clientName(contact)} — ${money(total)}`,
        lines: lineItems.map(
          (li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`
        ),
        endpoint: "/api/app/quotes",
        method: "POST",
        payload: {
          contactId: contact.id,
          title: str(args.title, 120) || undefined,
          lineItems,
        },
      });
    },
  },
  {
    decl: {
      name: "update_quote",
      description:
        "Stage quote changes (by quote number) — status and/or document edits. Status: AWAITING_RESPONSE = mark sent (starts the sent clock; auto-issues 'with quote' agreements; no email — use email_document for that), APPROVED = client said yes, CHANGES_REQUESTED, ARCHIVED, DRAFT. Edits (title, lineItems, discount, taxRate, deposit) work only on DRAFT/AWAITING_RESPONSE quotes and REPLACE ALL line items — call get_document first and resend the full list. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          quoteNumber: { type: "number" },
          status: {
            type: "string",
            enum: ["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "ARCHIVED"],
          },
          title: { type: "string" },
          lineItems: LINE_ITEMS_PARAM,
          clientMessage: { type: "string" },
          discountType: { type: "string", enum: ["PERCENT", "FIXED", "NONE"] },
          discountValue: { type: "number" },
          taxRate: { type: "number", description: "fraction, e.g. 0.08 for 8%" },
          depositType: { type: "string", enum: ["PERCENT", "FIXED", "FULL", "NONE"] },
          depositValue: { type: "number" },
        },
        required: ["quoteNumber"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.quoteNumber);
      const quote = await prisma.quote.findFirst({
        where: { companyId: actor.companyId, quoteNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!quote) return { error: `No quote #${n} (or not visible to this user).` };
      if (quote.status === "CONVERTED") {
        return { error: `Quote #${n} was converted to a job — it's locked.` };
      }
      const results: Record<string, unknown>[] = [];

      // document edit (route requires the full line-item list)
      const hasEdit =
        args.lineItems !== undefined || str(args.title, 120) || str(args.clientMessage, 2000) ||
        str(args.discountType, 10) || str(args.depositType, 10) || num(args.taxRate) !== null;
      if (hasEdit) {
        if (quote.status !== "DRAFT" && quote.status !== "AWAITING_RESPONSE") {
          return { error: `Quote #${n} is ${quote.status} — only DRAFT or AWAITING_RESPONSE quotes can be edited.` };
        }
        const lineItems = parseLineItems(args.lineItems);
        if (lineItems.length === 0) {
          return { error: "Edits replace ALL line items — call get_document for the current list and include the complete set (with your changes) in lineItems." };
        }
        const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
        const payload: Record<string, unknown> = { lineItems: itemsPayload(lineItems) };
        const lines = lineItems.map((li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`);
        const title = str(args.title, 120);
        if (title) {
          payload.title = title;
          lines.push(`Title: ${title}`);
        }
        const msg = str(args.clientMessage, 2000);
        if (msg) {
          payload.clientMessage = msg;
          lines.push(`Client message: ${msg.slice(0, 100)}`);
        }
        const discountType = str(args.discountType, 10);
        if (["PERCENT", "FIXED", "NONE"].includes(discountType)) {
          payload.discountType = discountType;
          payload.discountValue = num(args.discountValue) ?? 0;
          lines.push(discountType === "NONE" ? "Discount removed" : `Discount: ${discountType} ${num(args.discountValue) ?? 0}`);
        }
        const taxRate = num(args.taxRate);
        if (taxRate !== null && taxRate >= 0 && taxRate <= 1) {
          payload.taxRate = taxRate;
          lines.push(`Tax rate: ${(taxRate * 100).toFixed(2)}%`);
        }
        const depositType = str(args.depositType, 10);
        if (["PERCENT", "FIXED", "FULL", "NONE"].includes(depositType)) {
          payload.depositType = depositType;
          payload.depositValue = num(args.depositValue) ?? 0;
          lines.push(depositType === "NONE" ? "Deposit removed" : `Deposit: ${depositType} ${num(args.depositValue) ?? ""}`);
        }
        results.push(
          stage(ctx, {
            kind: "update_quote",
            title: `Edit quote #${n} — new subtotal ${money(total)}`,
            lines: [`Client: ${clientName(quote.contact)}`, ...lines],
            endpoint: `/api/app/quotes/${quote.id}`,
            method: "PATCH",
            payload,
          })
        );
      }

      // status change (separate PATCH — the route treats edit and status as different modes)
      const status = str(args.status, 24);
      if (status) {
        if (!["DRAFT", "AWAITING_RESPONSE", "APPROVED", "CHANGES_REQUESTED", "ARCHIVED"].includes(status)) {
          return { error: "Invalid status." };
        }
        if (quote.status === "APPROVED" && status !== "ARCHIVED") {
          return { error: `Quote #${n} is client-approved — it can only be archived (or converted to a job).` };
        }
        const labels: Record<string, string> = {
          DRAFT: "Move back to draft",
          AWAITING_RESPONSE: "Mark as sent",
          APPROVED: "Mark approved",
          CHANGES_REQUESTED: "Mark changes requested",
          ARCHIVED: "Archive",
        };
        results.push(
          stage(ctx, {
            kind: "update_quote",
            title: `${labels[status]}: quote #${n} — ${money(quote.total)}`,
            lines: [`Client: ${clientName(quote.contact)}`, `Currently: ${quote.status}`],
            endpoint: `/api/app/quotes/${quote.id}`,
            method: "PATCH",
            payload: { status },
          })
        );
      }

      if (results.length === 0) return { error: "Nothing to change — provide status or document edits." };
      return results[results.length - 1];
    },
  },
  {
    decl: {
      name: "convert_quote",
      description:
        "Stage converting an APPROVED quote (by quote number) into a job. Only approved quotes convert. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { quoteNumber: { type: "number" } },
        required: ["quoteNumber"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.quoteNumber);
      const quote = await prisma.quote.findFirst({
        where: { companyId: actor.companyId, quoteNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!quote) return { error: `No quote #${n} (or not visible to this user).` };
      if (quote.status !== "APPROVED") {
        return { error: `Quote #${n} is ${quote.status} — only APPROVED quotes convert to jobs.` };
      }
      return stage(ctx, {
        kind: "convert_quote",
        title: `Convert quote #${n} to a job — ${money(quote.total)}`,
        lines: [`Client: ${clientName(quote.contact)}`, quote.title && `"${quote.title}"`].filter(
          Boolean
        ) as string[],
        endpoint: `/api/app/quotes/${quote.id}/convert`,
        method: "POST",
        payload: {},
      });
    },
  },
  {
    decl: {
      name: "collect_deposit",
      description:
        "Stage issuing (or re-sending) the deposit invoice for a quote that has a deposit configured. Emails the client the pay link if they have an email. Idempotent — re-sends the existing deposit invoice if one exists. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { quoteNumber: { type: "number" } },
        required: ["quoteNumber"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const n = num(args.quoteNumber);
      const quote = await prisma.quote.findFirst({
        where: { companyId: actor.companyId, quoteNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, depositType: true, depositValue: true, total: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, email: true } },
        },
      });
      if (!quote) return { error: `No quote #${n} (or not visible to this user).` };
      if (quote.status === "ARCHIVED") return { error: `Quote #${n} is archived.` };
      if (quote.depositType === "NONE") {
        return { error: `Quote #${n} has no deposit configured — set one with update_quote (depositType/depositValue) first.` };
      }
      return stage(ctx, {
        kind: "collect_deposit",
        title: `Collect deposit on quote #${n}`,
        lines: [
          `Client: ${clientName(quote.contact)}`,
          `Deposit: ${quote.depositType === "FULL" ? "full amount" : `${quote.depositType} ${quote.depositValue ?? ""}`.trim()} of ${money(quote.total)}`,
          quote.contact.email
            ? `Emails the pay link to ${quote.contact.email}.`
            : "Client has no email — the pay link will be on the invoice page to share manually.",
        ],
        endpoint: `/api/app/quotes/${quote.id}/collect-deposit`,
        method: "POST",
        payload: {},
      });
    },
  },
];
