import { prisma } from "../db";
import { canSell, canSeeMoney, isManager, viaContactScope, jobScope } from "../permissions";
import { isQuickBooksConfigured } from "../quickbooks";
import { type Tool, str, num, day, money, clientName, companyTz, fmtWhen, stage } from "./core";

/**
 * Money features that shipped after Atlas v7: real processor refunds,
 * charging a card on file, duplicating documents, recurring monthly
 * expenses, QuickBooks sync, early payouts, CSV exports, and the manual
 * recurring-billing triggers.
 *
 * Anything that moves real money stages a `money` card: amber, unmergeable,
 * with the amount and destination spelled out.
 */

export const moneyExtraTools: Tool[] = [
  {
    decl: {
      name: "refund_payment",
      description:
        "Managers: stage a REAL refund of an online (card/bank) payment back to the client — full, or partial with amount. The money goes back through the processor; the invoice reopens for the refunded amount. Find payment ids with query_records entity payments (online=true) or get_client_activity. Hand-recorded payments (cash, check, Zelle) are bookkeeping — use edit_payment / delete_record instead.",
      parameters: { type: "object", properties: { paymentId: { type: "string" }, amount: { type: "number", description: "partial refund; omit for full" } }, required: ["paymentId"] },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const p = await prisma.payment.findFirst({
        where: { id: str(args.paymentId, 40), companyId: actor.companyId },
        select: { id: true, amount: true, method: true, processorRef: true, paidAt: true, invoice: { select: { id: true, invoiceNumber: true } }, contact: { select: { firstName: true, lastName: true, companyName: true } }, refunds: { select: { amount: true } } },
      });
      if (!p) return { error: "No payment with that id." };
      if (!p.processorRef?.startsWith("TR")) return { error: "That payment was recorded by hand, not taken online — correct it with edit_payment (partial) or delete_record (full) instead." };
      const max = Number(p.amount);
      if (max <= 0) return { error: "Nothing left to refund on this payment." };
      const amt = num(args.amount);
      const refund = amt === null ? max : Math.round(amt * 100) / 100;
      if (refund <= 0 || refund > max + 0.005) return { error: `Refund must be between $0.01 and ${money(max)}.` };
      return stage(ctx, {
        kind: "refund_payment",
        title: `Refund ${money(refund)} to ${p.contact ? clientName(p.contact) : "the client"}`,
        lines: [`${refund < max ? "Partial" : "Full"} refund of the ${money(max)} ${p.method} payment on invoice #${p.invoice.invoiceNumber} (${p.paidAt.toISOString().slice(0, 10)})`, "Goes back to the client's card or bank through the processor; the invoice balance reopens."],
        endpoint: `/api/app/payments/${p.id}/refund`, method: "POST", payload: amt === null ? {} : { amount: refund },
        money: true, confirmLabel: "Refund now", href: `/app/invoices/${p.invoice.id}`,
      });
    },
  },
  {
    decl: {
      name: "charge_saved_card",
      description: "Managers: stage charging an invoice's remaining balance to the client's card on file (default card, or cardId from get_client_details). A real charge — the client's card is billed and the invoice is marked paid.",
      parameters: { type: "object", properties: { invoiceNumber: { type: "integer" }, cardId: { type: "string" } }, required: ["invoiceNumber"] },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const inv = await prisma.invoice.findFirst({
        where: { companyId: actor.companyId, invoiceNumber: num(args.invoiceNumber) ?? -1 },
        select: { id: true, invoiceNumber: true, status: true, total: true, subject: true, payments: { select: { amount: true } }, contact: { select: { id: true, firstName: true, lastName: true, companyName: true, savedCards: { select: { id: true, label: true, isDefault: true } } } } },
      });
      if (!inv) return { error: `No invoice #${args.invoiceNumber}.` };
      if (!inv.contact) return { error: "This invoice has no client." };
      if (inv.status === "PAID" || inv.status === "ARCHIVED") return { error: `Invoice #${inv.invoiceNumber} is ${inv.status.toLowerCase()}.` };
      const balance = Math.max(0, Number(inv.total) - inv.payments.reduce((s, p) => s + Number(p.amount), 0));
      if (balance <= 0) return { error: "Nothing left to charge." };
      const cardId = str(args.cardId, 40);
      const card = cardId ? inv.contact.savedCards.find((c) => c.id === cardId) : inv.contact.savedCards.find((c) => c.isDefault) ?? inv.contact.savedCards[0];
      if (!card) return { error: cardId ? "No card with that id on this client." : "This client has no card on file — a card can be added from their client page." };
      return stage(ctx, {
        kind: "charge_saved_card",
        title: `Charge ${money(balance)} to ${clientName(inv.contact)}'s ${card.label}`,
        lines: [`Invoice #${inv.invoiceNumber}${inv.subject ? ` — ${inv.subject}` : ""}`, "Bills the card now; a receipt goes to the client and the invoice is marked paid."],
        endpoint: `/api/app/invoices/${inv.id}/charge-stored`, method: "POST", payload: { cardId: card.id },
        money: true, confirmLabel: "Charge card", href: `/app/invoices/${inv.id}`,
      });
    },
  },
  {
    decl: {
      name: "duplicate_document",
      description: "Stage copying a quote, invoice, or job into a new DRAFT (same client and line items, new number, unscheduled). Follow up with update_quote / update_invoice / update_job in the next turn if the copy needs changes.",
      parameters: { type: "object", properties: { kind: { type: "string", enum: ["quote", "invoice", "job"] }, number: { type: "integer" } }, required: ["kind", "number"] },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const kind = str(args.kind, 8);
      const n = num(args.number) ?? -1;
      const companyId = actor.companyId;
      if (kind === "quote") {
        const q = await prisma.quote.findFirst({ where: { companyId, quoteNumber: n, ...viaContactScope(actor) }, select: { id: true, title: true, total: true, contact: { select: { firstName: true, lastName: true, companyName: true } } } });
        if (!q) return { error: `No quote #${n}.` };
        return stage(ctx, { kind: "duplicate_quote", title: `Duplicate quote #${n} for ${clientName(q.contact)}`, lines: [`${q.title || "Quote"} — ${money(q.total)}`, "Creates a new draft with the same line items."], endpoint: `/api/app/quotes/${q.id}/duplicate`, method: "POST", payload: {}, confirmLabel: "Duplicate", href: "/app/quotes" });
      }
      if (kind === "invoice") {
        if (!canSeeMoney(actor)) return { error: "No access to invoices." };
        const i = await prisma.invoice.findFirst({ where: { companyId, invoiceNumber: n, ...viaContactScope(actor) }, select: { id: true, subject: true, total: true, contact: { select: { firstName: true, lastName: true, companyName: true } } } });
        if (!i) return { error: `No invoice #${n}.` };
        return stage(ctx, { kind: "duplicate_invoice", title: `Duplicate invoice #${n}${i.contact ? ` for ${clientName(i.contact)}` : ""}`, lines: [`${i.subject || "Invoice"} — ${money(i.total)}`, "Creates a new draft with the same line items."], endpoint: `/api/app/invoices/${i.id}/duplicate`, method: "POST", payload: {}, confirmLabel: "Duplicate", href: "/app/invoices" });
      }
      if (kind === "job") {
        const j = await prisma.job.findFirst({ where: { companyId, jobNumber: n, ...jobScope(actor) }, select: { id: true, title: true, contact: { select: { firstName: true, lastName: true, companyName: true } } } });
        if (!j) return { error: `No job #${n}.` };
        return stage(ctx, { kind: "duplicate_job", title: `Duplicate job #${n} for ${clientName(j.contact)}`, lines: [j.title, "New unscheduled job with the same line items; no crew, photos, or notes."], endpoint: `/api/app/jobs/${j.id}/duplicate`, method: "POST", payload: {}, confirmLabel: "Duplicate", href: "/app/jobs" });
      }
      return { error: "kind must be quote, invoice, or job" };
    },
  },
  {
    decl: {
      name: "manage_recurring_expense",
      description: "Managers: monthly recurring expenses (rent, insurance, software) that auto-post each month. action list; update to change amount/description/category/day-of-month, or pause/resume with active. To START one, call log_expense with repeatMonthly=true.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "update"] }, id: { type: "string" },
          description: { type: "string" }, category: { type: "string" }, amount: { type: "number" }, dayOfMonth: { type: "integer" }, active: { type: "boolean", description: "false pauses, true resumes" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      if (str(args.action, 8) === "list") {
        const rows = await prisma.recurringExpense.findMany({ where: { companyId: actor.companyId }, orderBy: [{ active: "desc" }, { dayOfMonth: "asc" }], take: 50, select: { id: true, description: true, category: true, amount: true, dayOfMonth: true, nextRunDate: true, active: true } });
        return { recurring: rows.map((r) => ({ id: r.id, description: r.description, category: r.category, amount: money(r.amount), dayOfMonth: r.dayOfMonth, nextPost: r.nextRunDate.toISOString().slice(0, 10), active: r.active })), monthlyTotal: money(rows.filter((r) => r.active).reduce((s, r) => s + Number(r.amount), 0)) };
      }
      const rec = await prisma.recurringExpense.findFirst({ where: { id: str(args.id, 40), companyId: actor.companyId }, select: { id: true, description: true, active: true } });
      if (!rec) return { error: "No recurring expense with that id (list first)." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const desc = str(args.description, 200); if (desc) { payload.description = desc; lines.push(`Description: ${desc}`); }
      if (args.category !== undefined) { const c = str(args.category, 60); payload.category = c; lines.push(`Category: ${c || "(none)"}`); }
      const amt = num(args.amount); if (amt !== null && amt > 0) { payload.amount = Math.round(amt * 100) / 100; lines.push(`Amount: ${money(payload.amount)}`); }
      const dom = num(args.dayOfMonth); if (dom !== null && dom >= 1 && dom <= 31) { payload.dayOfMonth = Math.round(dom); lines.push(`Posts on day ${payload.dayOfMonth}`); }
      if (typeof args.active === "boolean") { payload.active = args.active; lines.push(args.active ? "Resume" : "Pause"); }
      if (!lines.length) return { error: "Nothing to change." };
      return stage(ctx, { kind: "update_recurring_expense", title: `Update recurring expense "${rec.description}"`, lines, endpoint: `/api/app/expenses/recurring/${rec.id}`, method: "PATCH", payload, confirmLabel: "Save changes", href: "/app/business" });
    },
  },
  {
    decl: {
      name: "quickbooks",
      description: "Managers: QuickBooks Online integration. status = connection, last sync, counts, recent errors. sync = stage pushing everything unsynced now (invoices, payments, quotes as estimates, expenses). Connecting/disconnecting is done from Settings.",
      parameters: { type: "object", properties: { action: { type: "string", enum: ["status", "sync"] } }, required: ["action"] },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const configured = isQuickBooksConfigured();
      const conn = configured ? await prisma.quickBooksConnection.findUnique({ where: { companyId: actor.companyId } }) : null;
      if (!conn) return { connected: false, note: configured ? "Not connected — connect from /app/settings (QuickBooks)." : "QuickBooks isn't enabled on this platform yet." };
      if (str(args.action, 6) === "sync") {
        return stage(ctx, { kind: "quickbooks_sync", title: `Sync to QuickBooks (${conn.qboCompanyName ?? "connected company"})`, lines: ["Pushes unsynced invoices, payments, quotes (as estimates), and expenses."], endpoint: "/api/app/quickbooks/sync", method: "POST", payload: {}, confirmLabel: "Sync now", href: "/app/settings" });
      }
      const tz = await companyTz(actor.companyId);
      const [synced, errors] = await Promise.all([
        prisma.quickBooksSyncRecord.count({ where: { companyId: actor.companyId, status: "SYNCED" } }),
        prisma.quickBooksSyncRecord.findMany({ where: { companyId: actor.companyId, status: "ERROR" }, orderBy: { lastSyncedAt: "desc" }, take: 5, select: { entityType: true, localId: true, error: true } }),
      ]);
      return { connected: true, company: conn.qboCompanyName, autoSync: conn.autoSync, lastSync: conn.lastSyncAt ? fmtWhen(tz, conn.lastSyncAt, false) : null, lastError: conn.lastSyncError, reconnectNeeded: /invalid_grant|reconnect/i.test(conn.lastSyncError ?? ""), synced, errors: errors.map((e) => `${e.entityType} ${e.localId}: ${e.error}`) };
    },
  },
  {
    decl: {
      name: "send_payout",
      description: "Managers: stage 'send to bank now' — closes the current settlement early so collected card/bank payments pay out ahead of the normal schedule.",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, _args, ctx) => {
      const c = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { finixOnboardingState: true } });
      if (c?.finixOnboardingState !== "APPROVED") return { error: "Payouts need an approved payments account." };
      return stage(ctx, { kind: "send_payout", title: "Send unsettled funds to the bank now", lines: ["Closes the open settlement early; funds land on the bank's normal timeline from there."], endpoint: "/api/app/payments/payout", method: "POST", payload: {}, money: true, confirmLabel: "Send payout", href: "/app/payments" });
    },
  },
  {
    decl: {
      name: "export_data",
      description: "A CSV download link for clients, quotes, jobs, invoices, payments, or timesheets (optionally a date range for payments/timesheets). Paste the link — it downloads for the signed-in user.",
      parameters: { type: "object", properties: { entity: { type: "string", enum: ["clients", "quotes", "jobs", "invoices", "payments", "timesheets"] }, from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, required: ["entity"] },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const entity = str(args.entity, 12);
      const ok = entity === "clients" || entity === "quotes" ? canSell(actor.role) : entity === "invoices" || entity === "payments" ? canSeeMoney(actor) : entity === "jobs" || entity === "timesheets";
      if (!ok) return { error: `You don't have access to export ${entity || "that"}.` };
      const qs = new URLSearchParams();
      if (day(args.from)) qs.set("from", str(args.from, 10));
      if (day(args.to)) qs.set("to", str(args.to, 10));
      return { downloadLink: `/api/app/export/${entity}${qs.size ? `?${qs}` : ""}`, note: "Up to 10,000 rows. Paste the link as-is." };
    },
  },
  {
    decl: {
      name: "run_recurring_billing",
      description: "Managers: stage the manual recurring-billing triggers. bill_ready invoices every per-visit plan's completed-but-unbilled visits now; run_due processes every due billing cycle, monthly consolidation, and visit generation (what the nightly job does). Both may charge cards on file.",
      parameters: { type: "object", properties: { action: { type: "string", enum: ["bill_ready", "run_due"] } }, required: ["action"] },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 10);
      if (action !== "bill_ready" && action !== "run_due") return { error: "action must be bill_ready or run_due" };
      const active = await prisma.subscription.count({ where: { companyId: actor.companyId, status: "ACTIVE" } });
      if (active === 0) return { error: "There are no active subscriptions to bill." };
      return stage(ctx, {
        kind: action === "bill_ready" ? "bill_ready_visits" : "run_recurring_billing",
        title: action === "bill_ready" ? "Bill completed visits now" : "Run recurring billing now",
        lines: [action === "bill_ready" ? "One invoice per plan for visits completed since the last bill." : "Processes due cycles, monthly consolidations, and upcoming visits.", "Plans set to autopay charge the card on file."],
        endpoint: action === "bill_ready" ? "/api/app/subscriptions/bill-ready" : "/api/app/subscriptions/run", method: "POST", payload: {},
        money: true, confirmLabel: action === "bill_ready" ? "Bill visits" : "Run billing", href: "/app/subscriptions",
      });
    },
  },
];
