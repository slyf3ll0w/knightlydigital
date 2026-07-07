import { prisma } from "../db";
import {
  canSell,
  canSeeMoney,
  isManager,
  viaContactScope,
} from "../permissions";
import {
  type Tool,
  str,
  num,
  day,
  money,
  clientName,
  companyTz,
  findContact,
  stage,
  parseLineItems,
  LINE_ITEMS_PARAM,
} from "./core";
import { itemsPayload } from "./pipeline";

/** Invoices, payments, subscriptions, expenses, and real email sends. */
export const moneyTools: Tool[] = [
  {
    decl: {
      name: "list_money",
      description:
        "Recent invoices or payments. Filter invoices by status: DRAFT, AWAITING_PAYMENT, PAID, PAST_DUE. Invoice results include the invoice number needed for record_payment; payment results include the id needed for edit_payment.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["invoices", "payments"] },
          status: { type: "string", description: "invoice status filter (optional)" },
        },
        required: ["kind"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      if (args.kind === "payments") {
        const rows = await prisma.payment.findMany({
          where: { companyId: actor.companyId, ...viaContactScope(actor) },
          take: 15, orderBy: { paidAt: "desc" },
          select: {
            id: true, amount: true, method: true, paidAt: true,
            invoice: { select: { invoiceNumber: true } },
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        });
        return {
          payments: rows.map((p) => ({
            id: p.id, amount: money(p.amount), method: p.method,
            invoiceN: p.invoice.invoiceNumber,
            client: p.contact ? clientName(p.contact) : null,
            on: p.paidAt.toISOString().slice(0, 10),
          })),
        };
      }
      const valid = ["DRAFT", "AWAITING_PAYMENT", "PAID", "PAST_DUE"];
      const status = valid.includes(str(args.status, 20)) ? (str(args.status, 20) as never) : undefined;
      const rows = await prisma.invoice.findMany({
        where: { companyId: actor.companyId, ...viaContactScope(actor), status },
        take: 15, orderBy: { updatedAt: "desc" },
        select: {
          invoiceNumber: true, status: true, total: true, dueDate: true, subject: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          payments: { select: { amount: true } },
        },
      });
      return {
        invoices: rows.map((i) => {
          const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
          return {
            n: i.invoiceNumber, subject: i.subject, status: i.status,
            total: money(i.total), paid: money(paid),
            due: i.dueDate?.toISOString().slice(0, 10),
            client: i.contact ? clientName(i.contact) : null,
          };
        }),
      };
    },
  },
  {
    decl: {
      name: "business_summary",
      description:
        "Money and activity totals for a date range (max 1 year): payments collected, amount invoiced, expenses, new clients, jobs completed. Call twice with different ranges to compare periods.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["from", "to"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      const from = day(args.from);
      const to = day(args.to);
      if (!from || !to) return { error: "from/to must be YYYY-MM-DD" };
      const end = new Date(to.getTime() + 86400000);
      if (end.getTime() - from.getTime() > 370 * 86400000) return { error: "Range too wide — max 1 year." };
      const companyId = actor.companyId;
      const [payments, invoiced, expenses, newClients, jobsDone] = await Promise.all([
        prisma.payment.aggregate({
          where: { companyId, paidAt: { gte: from, lt: end } },
          _sum: { amount: true }, _count: true,
        }),
        prisma.invoice.aggregate({
          where: { companyId, issuedAt: { gte: from, lt: end } },
          _sum: { total: true }, _count: true,
        }),
        isManager(actor.role)
          ? prisma.expense.aggregate({
              where: { companyId, incurredAt: { gte: from, lt: end } },
              _sum: { amount: true },
            })
          : Promise.resolve(null),
        prisma.contact.count({ where: { companyId, createdAt: { gte: from, lt: end } } }),
        prisma.job.count({ where: { companyId, completedAt: { gte: from, lt: end } } }),
      ]);
      return {
        paymentsCollected: money(payments._sum.amount),
        paymentCount: payments._count,
        invoiced: money(invoiced._sum.total),
        invoiceCount: invoiced._count,
        ...(expenses ? { expenses: money(expenses._sum.amount) } : {}),
        newClients,
        jobsCompleted: jobsDone,
      };
    },
  },
  {
    decl: {
      name: "list_subscriptions",
      description:
        "Recurring billing subscriptions: id (needed for manage_subscription), plan, client, price, interval, status, next bill date.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED"] } },
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args) => {
      const valid = ["ACTIVE", "PAUSED", "CANCELLED"];
      const status = valid.includes(str(args.status, 12)) ? (str(args.status, 12) as never) : undefined;
      const rows = await prisma.subscription.findMany({
        where: { companyId: actor.companyId, ...viaContactScope(actor), status },
        take: 15, orderBy: { nextRunDate: "asc" },
        select: {
          id: true, name: true, status: true, interval: true, unitPrice: true, quantity: true, nextRunDate: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      return {
        subscriptions: rows.map((s) => ({
          id: s.id, name: s.name, client: clientName(s.contact), status: s.status,
          price: money(Number(s.unitPrice) * Number(s.quantity)), interval: s.interval,
          nextBill: s.nextRunDate.toISOString().slice(0, 10),
        })),
      };
    },
  },

  // ── invoices ────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "create_invoice",
      description:
        "Stage a draft invoice for a client (not tied to a job). The user reviews it and can send it with email_document. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          subject: { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD (optional)" },
          lineItems: LINE_ITEMS_PARAM,
        },
        required: ["clientId", "lineItems"],
      },
    },
    allowed: (a) => canSeeMoney(a) && canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const lineItems = parseLineItems(args.lineItems);
      if (lineItems.length === 0) return { error: "At least one line item with a description is required." };
      const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
      const dueDate = day(args.dueDate) ? str(args.dueDate, 10) : undefined;
      return stage(ctx, {
        kind: "create_invoice",
        title: `Draft invoice for ${clientName(contact)} — ${money(total)}`,
        lines: [
          ...lineItems.map((li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`),
          dueDate ? `Due: ${dueDate}` : null,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/invoices",
        method: "POST",
        payload: {
          contactId: contact.id,
          subject: str(args.subject, 120) || undefined,
          lineItems,
          ...(dueDate ? { dueDate } : {}),
        },
      });
    },
  },
  {
    decl: {
      name: "update_invoice",
      description:
        "Stage invoice changes (by invoice number) — status and/or document edits. Status: AWAITING_PAYMENT = issue/mark sent (no email — use email_document), PAST_DUE = flag overdue, DRAFT = back to draft; to mark PAID prefer record_payment so the money is on the books. Edits (subject, dueDate, lineItems, discount, taxRate) REPLACE ALL line items — call get_document first and resend the full list. PAID invoices are locked. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: { type: "number" },
          status: { type: "string", enum: ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID"] },
          subject: { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          lineItems: LINE_ITEMS_PARAM,
          discountType: { type: "string", enum: ["PERCENT", "FIXED", "NONE"] },
          discountValue: { type: "number" },
          taxRate: { type: "number", description: "fraction, e.g. 0.08 for 8%" },
        },
        required: ["invoiceNumber"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args, ctx) => {
      const n = num(args.invoiceNumber);
      const invoice = await prisma.invoice.findFirst({
        where: { companyId: actor.companyId, invoiceNumber: n ?? -1, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          payments: { select: { amount: true } },
        },
      });
      if (!invoice) return { error: `No invoice #${n} (or not visible to this user).` };
      const results: Record<string, unknown>[] = [];

      // document edit (route requires the full line-item list; PAID locked)
      const hasEdit =
        args.lineItems !== undefined || str(args.subject, 120) || str(args.dueDate, 10) ||
        str(args.discountType, 10) || num(args.taxRate) !== null;
      if (hasEdit) {
        if (invoice.status === "PAID") return { error: `Invoice #${n} is PAID — paid invoices can't be edited.` };
        const lineItems = parseLineItems(args.lineItems);
        if (lineItems.length === 0) {
          return { error: "Edits replace ALL line items — call get_document for the current list and include the complete set (with your changes) in lineItems." };
        }
        const total = lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
        const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
        const payload: Record<string, unknown> = { lineItems: itemsPayload(lineItems) };
        const lines = lineItems.map((li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`);
        const subject = str(args.subject, 120);
        if (subject) {
          payload.subject = subject;
          lines.push(`Subject: ${subject}`);
        }
        if (day(args.dueDate)) {
          payload.dueDate = str(args.dueDate, 10);
          lines.push(`Due: ${str(args.dueDate, 10)}`);
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
        if (paid > 0) lines.push(`Note: ${money(paid)} already paid — the new total can't drop below that.`);
        results.push(
          stage(ctx, {
            kind: "update_invoice",
            title: `Edit invoice #${n} — new subtotal ${money(total)}`,
            lines: [
              invoice.contact ? `Client: ${clientName(invoice.contact)}` : null,
              ...lines,
            ].filter(Boolean) as string[],
            endpoint: `/api/app/invoices/${invoice.id}`,
            method: "PATCH",
            payload,
          })
        );
      }

      // status change (separate /status endpoint)
      const status = str(args.status, 24);
      if (status) {
        if (!["DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID"].includes(status)) {
          return { error: "Invalid status." };
        }
        const labels: Record<string, string> = {
          DRAFT: "Move back to draft",
          AWAITING_PAYMENT: "Mark as sent (awaiting payment)",
          PAST_DUE: "Flag past due",
          PAID: "Mark paid (no payment record)",
        };
        results.push(
          stage(ctx, {
            kind: "update_invoice",
            title: `${labels[status]}: invoice #${n} — ${money(invoice.total)}`,
            lines: [
              invoice.contact ? `Client: ${clientName(invoice.contact)}` : null,
              `Currently: ${invoice.status}`,
            ].filter(Boolean) as string[],
            endpoint: `/api/app/invoices/${invoice.id}/status`,
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
      name: "email_document",
      description:
        "Stage REALLY emailing a quote or invoice to the client — the quote's approval link or the invoice's pay link. (Unlike marking sent via update_quote/update_invoice, confirming this card sends an actual email.) Client must have an email on file. Quotes must be DRAFT/AWAITING_RESPONSE/CHANGES_REQUESTED; invoices anything but PAID. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["quote", "invoice"] },
          number: { type: "number" },
        },
        required: ["kind", "number"],
      },
    },
    allowed: (a) => canSell(a.role) || canSeeMoney(a),
    run: async (actor, args, ctx) => {
      const n = num(args.number);
      if (!n) return { error: "number is required" };
      if (args.kind === "quote") {
        if (!canSell(actor.role)) return { error: "This user's role can't send quotes." };
        const q = await prisma.quote.findFirst({
          where: { companyId: actor.companyId, quoteNumber: n, ...viaContactScope(actor) },
          select: {
            id: true, status: true, total: true,
            contact: { select: { firstName: true, lastName: true, companyName: true, email: true } },
          },
        });
        if (!q) return { error: `No quote #${n} (or not visible to this user).` };
        if (!["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"].includes(q.status)) {
          return { error: `Quote #${n} is ${q.status} — it can't be emailed.` };
        }
        if (!q.contact.email) return { error: "This client has no email on file — add one first (update_client)." };
        return stage(ctx, {
          kind: "email_document",
          title: `Email quote #${n} (${money(q.total)}) to ${clientName(q.contact)}`,
          lines: [
            `Sends the approval link to ${q.contact.email} immediately on confirm.`,
            ...(q.status === "DRAFT" ? ["Also marks the quote sent (Awaiting Response)."] : []),
          ],
          endpoint: `/api/app/quotes/${q.id}/send`,
          method: "POST",
          payload: {},
        });
      }
      if (!canSeeMoney(actor)) return { error: "This user's role can't send invoices." };
      const i = await prisma.invoice.findFirst({
        where: { companyId: actor.companyId, invoiceNumber: n, ...viaContactScope(actor) },
        select: {
          id: true, status: true, total: true,
          contact: { select: { firstName: true, lastName: true, companyName: true, email: true } },
        },
      });
      if (!i) return { error: `No invoice #${n} (or not visible to this user).` };
      if (i.status === "PAID") return { error: `Invoice #${n} is already paid.` };
      if (!i.contact?.email) return { error: "This client has no email on file — add one first (update_client)." };
      return stage(ctx, {
        kind: "email_document",
        title: `Email invoice #${n} (${money(i.total)}) to ${clientName(i.contact)}`,
        lines: [
          `Sends the pay link to ${i.contact.email} immediately on confirm.`,
          ...(i.status === "DRAFT" ? ["Also marks the invoice sent (Awaiting Payment)."] : []),
        ],
        endpoint: `/api/app/invoices/${i.id}/send`,
        method: "POST",
        payload: {},
      });
    },
  },

  // ── payments ────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "record_payment",
      description:
        "Stage recording a payment against an invoice (find the invoice number via list_money or get_client_activity first). method: CASH, CHECK, CASH_APP, PAYPAL, VENMO, ZELLE, CARD, ACH, OTHER. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          invoiceNumber: { type: "number" },
          amount: { type: "number" },
          method: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD (optional, defaults today)" },
        },
        required: ["invoiceNumber", "amount", "method"],
      },
    },
    allowed: (a) => canSeeMoney(a),
    run: async (actor, args, ctx) => {
      const n = num(args.invoiceNumber);
      const amount = num(args.amount);
      const method = str(args.method, 12).toUpperCase();
      const validMethods = ["CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER"];
      if (!n) return { error: "invoiceNumber is required" };
      if (!amount || amount <= 0 || amount > 1_000_000) return { error: "amount must be a positive number" };
      if (!validMethods.includes(method)) return { error: `method must be one of ${validMethods.join(", ")}` };
      const invoice = await prisma.invoice.findFirst({
        where: { companyId: actor.companyId, invoiceNumber: n, ...viaContactScope(actor) },
        select: {
          id: true, total: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
          payments: { select: { amount: true } },
        },
      });
      if (!invoice) return { error: `No invoice #${n} (or not visible to this user).` };
      const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
      const dateStr = day(args.date) ? str(args.date, 10) : undefined;
      return stage(ctx, {
        kind: "record_payment",
        title: `Record ${money(amount)} ${method.replace("_", " ")} payment on invoice #${n}`,
        lines: [
          invoice.contact ? `Client: ${clientName(invoice.contact)}` : null,
          `Invoice total ${money(invoice.total)}, ${money(paid)} already paid`,
          dateStr ? `Payment date: ${dateStr}` : null,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/payments",
        method: "POST",
        payload: { invoiceId: invoice.id, amount, method, ...(dateStr ? { paidAt: dateStr } : {}) },
      });
    },
  },
  {
    decl: {
      name: "edit_payment",
      description:
        "Stage correcting a recorded payment — amount (e.g. a partial refund), method, or date. Get the payment id from list_money (kind: payments). Owners/admins only. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          paymentId: { type: "string" },
          amount: { type: "number", description: "corrected amount" },
          method: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["paymentId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const payment = await prisma.payment.findFirst({
        where: { id: str(args.paymentId, 40), companyId: actor.companyId },
        select: {
          id: true, amount: true, method: true,
          invoice: { select: { invoiceNumber: true } },
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!payment) return { error: "No payment with that id — check list_money (kind: payments)." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const amount = num(args.amount);
      if (amount !== null && amount > 0 && amount <= 1_000_000) {
        payload.amount = amount;
        lines.push(`Amount: ${money(payment.amount)} → ${money(amount)}`);
      }
      const method = str(args.method, 12).toUpperCase();
      if (["CARD", "ACH", "CASH", "CHECK", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER"].includes(method)) {
        payload.method = method;
        lines.push(`Method: ${payment.method} → ${method}`);
      }
      if (day(args.date)) {
        payload.paidAt = str(args.date, 10);
        lines.push(`Date: ${str(args.date, 10)}`);
      }
      if (lines.length === 0) return { error: "Provide at least one of amount, method, date." };
      return stage(ctx, {
        kind: "edit_payment",
        title: `Correct payment on invoice #${payment.invoice.invoiceNumber}`,
        lines: [
          payment.contact ? `Client: ${clientName(payment.contact)}` : null,
          ...lines,
          "The invoice's paid/unpaid status recalculates automatically.",
        ].filter(Boolean) as string[],
        endpoint: `/api/app/payments/${payment.id}`,
        method: "PATCH",
        payload,
      });
    },
  },

  // ── subscriptions ───────────────────────────────────────────────────────────

  {
    decl: {
      name: "manage_subscription",
      description:
        "Stage subscription changes (id from list_subscriptions): pause/resume/cancel (status), bill this cycle right now (billNow: true), or edit the plan (name, unitPrice, quantity, interval MONTHLY/QUARTERLY/SEMIANNUAL/ANNUAL, nextRunDate YYYY-MM-DD — applies from the next bill). Managers only. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          subscriptionId: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED"] },
          billNow: { type: "boolean" },
          name: { type: "string" },
          unitPrice: { type: "number" },
          quantity: { type: "number" },
          interval: { type: "string", enum: ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] },
          nextRunDate: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["subscriptionId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const sub = await prisma.subscription.findFirst({
        where: { id: str(args.subscriptionId, 40), companyId: actor.companyId },
        select: {
          id: true, name: true, status: true, unitPrice: true, quantity: true, interval: true,
          nextRunDate: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!sub) return { error: "No subscription with that id — check list_subscriptions." };

      // billNow takes priority at the route, so keep it a dedicated card
      if (args.billNow === true) {
        if (sub.status !== "ACTIVE") return { error: `This subscription is ${sub.status} — only active ones can bill.` };
        return stage(ctx, {
          kind: "manage_subscription",
          title: `Bill "${sub.name}" now — ${money(Number(sub.unitPrice) * Number(sub.quantity))}`,
          lines: [
            `Client: ${clientName(sub.contact)}`,
            "Issues this cycle's invoice immediately and advances the next bill date.",
          ],
          endpoint: `/api/app/subscriptions/${sub.id}`,
          method: "PATCH",
          payload: { action: "billNow" },
        });
      }

      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const status = str(args.status, 12);
      if (["ACTIVE", "PAUSED", "CANCELLED"].includes(status) && status !== sub.status) {
        payload.status = status;
        const verbs: Record<string, string> = {
          ACTIVE: "Resume billing", PAUSED: "Pause billing (reversible)", CANCELLED: "Cancel — billing stops for good",
        };
        lines.push(verbs[status]);
      }
      const name = str(args.name, 150);
      if (name && name !== sub.name) {
        payload.name = name;
        lines.push(`Rename to: ${name}`);
      }
      const unitPrice = num(args.unitPrice);
      if (unitPrice !== null && unitPrice >= 0 && unitPrice <= 100000) {
        payload.unitPrice = unitPrice;
        lines.push(`Price: ${money(sub.unitPrice)} → ${money(unitPrice)}`);
      }
      const quantity = num(args.quantity);
      if (quantity !== null && quantity > 0 && quantity <= 999) {
        payload.quantity = quantity;
        lines.push(`Quantity: ${quantity}`);
      }
      const interval = str(args.interval, 12);
      if (["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"].includes(interval) && interval !== sub.interval) {
        payload.interval = interval;
        lines.push(`Interval: ${sub.interval} → ${interval}`);
      }
      if (day(args.nextRunDate)) {
        payload.nextRunDate = str(args.nextRunDate, 10);
        lines.push(`Next bill: ${sub.nextRunDate.toISOString().slice(0, 10)} → ${str(args.nextRunDate, 10)}`);
      }
      if (lines.length === 0) {
        return { error: "Nothing to change — provide status, billNow, or plan edits (name/unitPrice/quantity/interval/nextRunDate)." };
      }
      if (payload.unitPrice !== undefined || payload.quantity !== undefined || payload.interval !== undefined) {
        lines.push("Applies from the next bill — invoices already issued don't change.");
      }
      return stage(ctx, {
        kind: "manage_subscription",
        title: `Update subscription "${sub.name}"`,
        lines: [`Client: ${clientName(sub.contact)}`, ...lines],
        endpoint: `/api/app/subscriptions/${sub.id}`,
        method: "PATCH",
        payload,
      });
    },
  },

  // ── expenses ────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "list_expenses",
      description:
        "Business expenses (managers) with the id needed for update_expense/delete_record: description, category, amount, date. Optional from/to YYYY-MM-DD; default is the last 90 days.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args) => {
      const from = day(args.from) ?? new Date(Date.now() - 90 * 86400000);
      const to = day(args.to);
      const end = to ? new Date(to.getTime() + 86400000) : new Date(Date.now() + 86400000);
      const rows = await prisma.expense.findMany({
        where: { companyId: actor.companyId, incurredAt: { gte: from, lt: end } },
        take: 20, orderBy: { incurredAt: "desc" },
        select: { id: true, description: true, category: true, amount: true, incurredAt: true },
      });
      return {
        expenses: rows.map((e) => ({
          id: e.id, description: e.description, category: e.category,
          amount: money(e.amount), on: e.incurredAt.toISOString().slice(0, 10),
        })),
      };
    },
  },
  {
    decl: {
      name: "log_expense",
      description:
        "Stage recording a business expense (managers): description, amount, optional category and date. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string", description: "e.g. Fuel, Materials, Equipment" },
          date: { type: "string", description: "YYYY-MM-DD (optional, defaults today)" },
        },
        required: ["description", "amount"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const description = str(args.description, 200);
      const amount = num(args.amount);
      if (!description) return { error: "description is required" };
      if (!amount || amount <= 0 || amount > 1_000_000) return { error: "amount must be a positive number" };
      const tz = await companyTz(actor.companyId);
      const dateStr = day(args.date)
        ? str(args.date, 10)
        : new Date().toLocaleDateString("en-CA", { timeZone: tz });
      const category = str(args.category, 60);
      return stage(ctx, {
        kind: "log_expense",
        title: `Log expense: ${description} — ${money(amount)}`,
        lines: [category && `Category: ${category}`, `Date: ${dateStr}`].filter(Boolean) as string[],
        endpoint: "/api/app/expenses",
        method: "POST",
        payload: { description, amount, category: category || undefined, incurredAt: dateStr },
      });
    },
  },
  {
    decl: {
      name: "update_expense",
      description:
        "Stage correcting an expense (managers): description, amount, category, or date. Get the id from list_expenses. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          expenseId: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          category: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["expenseId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const expense = await prisma.expense.findFirst({
        where: { id: str(args.expenseId, 40), companyId: actor.companyId },
        select: { id: true, description: true, amount: true },
      });
      if (!expense) return { error: "No expense with that id — check list_expenses." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const description = str(args.description, 300);
      if (description) {
        payload.description = description;
        lines.push(`Description: ${description}`);
      }
      const amount = num(args.amount);
      if (amount !== null && amount > 0 && amount <= 1_000_000) {
        payload.amount = amount;
        lines.push(`Amount: ${money(expense.amount)} → ${money(amount)}`);
      }
      const category = str(args.category, 100);
      if (category) {
        payload.category = category;
        lines.push(`Category: ${category}`);
      }
      if (day(args.date)) {
        payload.incurredAt = str(args.date, 10);
        lines.push(`Date: ${str(args.date, 10)}`);
      }
      if (lines.length === 0) return { error: "Provide at least one of description, amount, category, date." };
      return stage(ctx, {
        kind: "update_expense",
        title: `Correct expense: ${expense.description}`,
        lines,
        endpoint: `/api/app/expenses/${expense.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
];
