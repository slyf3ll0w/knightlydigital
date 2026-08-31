/**
 * Nightly financial reconciliation.
 *
 * Independent of the code paths that WRITE money records, this sweep re-derives
 * every invariant the billing system promises and flags drift — the class of
 * bug no E2E test anticipates. Runs from the hourly cron (`/api/cron/recurring`)
 * but self-gates to once a day via the latest ReconcileRun row; findings are
 * persisted and emailed to the platform operator.
 *
 * Invariants checked, per company:
 *  - Invoice math: total = subtotal − discount + tax − depositApplied, and
 *    subtotal = Σ line-item totals.
 *  - Status vs balance: PAID ⇔ paid > 0 and balance ≤ 0 (balance per
 *    invoiceBalance: total + Σ surcharges − Σ payments). Overpayment flagged.
 *  - Payment integrity: no processorRef shared by two payments; near-duplicate
 *    processor charges (same invoice + amount within 10 min) flagged.
 *  - Refund integrity: positive amounts; processor refunds carry reversalRef.
 *  - Subscription shape: interval and billPerVisit mutually exclusive;
 *    consolidateMonthly requires billPerVisit; an ACTIVE scheduled plan whose
 *    nextRunDate sits > 48h in the past means the billing cron is dead.
 *  - Engine double-bill: two engine invoices (subscriptionId set, no job) for
 *    the same scheduled plan within 20 hours.
 *  - Cross-tenant: an invoice/payment/subscription whose contact belongs to a
 *    different company than the record itself.
 *  - Card mirror: Contact.processorCustomerRef must equal the default
 *    SavedCard's instrumentRef (autopay resolves through both).
 *  - Stale charge locks (> 1h) — harmless by lease, but marks a crashed charge.
 *  - Finix cross-check (when configured): recent processor payments' transfers
 *    re-fetched from Finix; state must be SUCCEEDED/PENDING and the amount
 *    must equal payment.amount + Σ refunds.
 */

import { prisma } from "@/lib/db";
import { invoiceBalance } from "@/lib/payments";
import * as finix from "@/lib/finix";
import { sendEmail } from "@/lib/email";

export interface ReconcileFinding {
  companyId: string;
  companyName: string;
  severity: "error" | "warning";
  check: string;
  entity: string; // "invoice" | "payment" | "refund" | "subscription" | "contact"
  entityId: string;
  detail: string;
}

const CENT = 0.011; // rounding tolerance on 2dp money math
const RUN_GATE_HOURS = 20; // hourly cron → at most one run a day
const FINIX_LOOKBACK_MS = 48 * 3600_000;
const FINIX_MAX_LOOKUPS = 100;

const num = (d: unknown): number => Number(d ?? 0);
const money = (n: number): string => `$${n.toFixed(2)}`;

/**
 * Run the sweep if it hasn't run in the last ~day. Returns a summary for the
 * cron response ("skipped" when gated). Never throws — the cron's other sweeps
 * must not die because reconciliation did.
 */
export async function runNightlyReconciliation(
  now: Date
): Promise<{ ran: boolean; errors?: number; warnings?: number }> {
  try {
    const latest = await prisma.reconcileRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (
      latest &&
      now.getTime() - latest.startedAt.getTime() < RUN_GATE_HOURS * 3600_000
    ) {
      return { ran: false };
    }

    const run = await prisma.reconcileRun.create({ data: { startedAt: now } });
    const { findings, companies, invoicesChecked } = await collectFindings(now);
    const errors = findings.filter((f) => f.severity === "error").length;
    const warnings = findings.length - errors;

    const emailedTo = await maybeSendReport(now, findings, {
      companies,
      invoicesChecked,
    });

    await prisma.reconcileRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        companies,
        invoicesChecked,
        errorCount: errors,
        warningCount: warnings,
        findings: findings.length
          ? (findings as unknown as object)
          : undefined,
        emailedTo,
      },
    });

    if (findings.length) {
      console.error(
        `[reconcile] ${errors} error(s), ${warnings} warning(s) across ${companies} companies`
      );
    }
    return { ran: true, errors, warnings };
  } catch (err) {
    console.error("[reconcile] sweep failed", err);
    return { ran: false };
  }
}

async function collectFindings(now: Date): Promise<{
  findings: ReconcileFinding[];
  companies: number;
  invoicesChecked: number;
}> {
  const findings: ReconcileFinding[] = [];
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
  });
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));
  const add = (
    companyId: string,
    severity: "error" | "warning",
    check: string,
    entity: string,
    entityId: string,
    detail: string
  ) =>
    findings.push({
      companyId,
      companyName: nameOf.get(companyId) ?? companyId,
      severity,
      check,
      entity,
      entityId,
      detail,
    });

  // ── Invoices: math + status vs balance ─────────────────────────────────────
  // One pass over all non-archived invoices with payments + line items.
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: {
      id: true,
      companyId: true,
      invoiceNumber: true,
      status: true,
      subtotal: true,
      discount: true,
      tax: true,
      depositApplied: true,
      total: true,
      paidAt: true,
      chargeLockedAt: true,
      contact: { select: { companyId: true } },
      lineItems: { select: { total: true } },
      payments: { select: { amount: true, surchargeAmount: true } },
    },
  });

  for (const inv of invoices) {
    const label = `invoice #${inv.invoiceNumber}`;

    // total = subtotal − discount + tax − depositApplied
    const expected =
      num(inv.subtotal) - num(inv.discount) + num(inv.tax) - num(inv.depositApplied);
    if (Math.abs(expected - num(inv.total)) > CENT) {
      add(
        inv.companyId, "error", "invoice-math", "invoice", inv.id,
        `${label}: stored total ${money(num(inv.total))} ≠ subtotal − discount + tax − deposit = ${money(expected)}`
      );
    }
    // subtotal = Σ line items (engine and hand-built invoices always carry lines)
    if (inv.lineItems.length > 0) {
      const lineSum = inv.lineItems.reduce((s, li) => s + num(li.total), 0);
      if (Math.abs(lineSum - num(inv.subtotal)) > CENT) {
        add(
          inv.companyId, "error", "invoice-line-sum", "invoice", inv.id,
          `${label}: line items sum to ${money(lineSum)} but subtotal is ${money(num(inv.subtotal))}`
        );
      }
    } else if (num(inv.subtotal) > CENT) {
      add(
        inv.companyId, "warning", "invoice-line-sum", "invoice", inv.id,
        `${label}: subtotal ${money(num(inv.subtotal))} with zero line items`
      );
    }

    const paid = inv.payments.reduce((s, p) => s + num(p.amount), 0);
    const balance = invoiceBalance(inv);
    if (inv.status === "PAID" && balance > 0.005) {
      add(
        inv.companyId, "error", "status-vs-balance", "invoice", inv.id,
        `${label}: marked PAID with ${money(balance)} still outstanding`
      );
    }
    if (inv.status !== "PAID" && paid > 0.005 && balance <= 0.005) {
      add(
        inv.companyId, "error", "status-vs-balance", "invoice", inv.id,
        `${label}: fully paid (${money(paid)}) but status is ${inv.status}`
      );
    }
    if (inv.status === "PAID" && !inv.paidAt) {
      add(
        inv.companyId, "warning", "paid-at-missing", "invoice", inv.id,
        `${label}: PAID without a paidAt stamp`
      );
    }
    if (balance < -0.01) {
      add(
        inv.companyId, "warning", "overpaid", "invoice", inv.id,
        `${label}: overpaid by ${money(-balance)}`
      );
    }
    if (
      inv.chargeLockedAt &&
      now.getTime() - inv.chargeLockedAt.getTime() > 3600_000
    ) {
      add(
        inv.companyId, "warning", "stale-charge-lock", "invoice", inv.id,
        `${label}: charge lock stamped ${inv.chargeLockedAt.toISOString()} — a charge attempt crashed mid-flight`
      );
    }
    if (inv.contact && inv.contact.companyId !== inv.companyId) {
      add(
        inv.companyId, "error", "cross-tenant", "invoice", inv.id,
        `${label}: linked contact belongs to a different company`
      );
    }
  }

  // ── Payments: duplicate processor refs + near-duplicate charges ────────────
  const dupRefs = await prisma.payment.groupBy({
    by: ["processorRef"],
    where: { processorRef: { not: null } },
    having: { processorRef: { _count: { gt: 1 } } },
    _count: { processorRef: true },
  });
  for (const d of dupRefs) {
    const rows = await prisma.payment.findMany({
      where: { processorRef: d.processorRef },
      select: { id: true, companyId: true, invoiceId: true },
    });
    add(
      rows[0].companyId, "error", "duplicate-processor-ref", "payment", rows[0].id,
      `processor transfer ${d.processorRef} is recorded on ${rows.length} payments (${rows.map((r) => r.id).join(", ")})`
    );
  }

  const recentProcessorPayments = await prisma.payment.findMany({
    where: {
      processorRef: { not: null },
      createdAt: { gte: new Date(now.getTime() - 7 * 86400_000) },
    },
    select: {
      id: true,
      companyId: true,
      invoiceId: true,
      amount: true,
      createdAt: true,
      processorRef: true,
      refunds: { select: { amount: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const byInvoice = new Map<string, typeof recentProcessorPayments>();
  for (const p of recentProcessorPayments) {
    const list = byInvoice.get(p.invoiceId) ?? [];
    list.push(p);
    byInvoice.set(p.invoiceId, list);
  }
  for (const [invoiceId, list] of byInvoice) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      // Compare original charge amounts (refunds shrink `amount` in place).
      const origA = num(a.amount) + a.refunds.reduce((s, r) => s + num(r.amount), 0);
      const origB = num(b.amount) + b.refunds.reduce((s, r) => s + num(r.amount), 0);
      if (
        Math.abs(origA - origB) < 0.005 &&
        b.createdAt.getTime() - a.createdAt.getTime() < 10 * 60_000
      ) {
        add(
          b.companyId, "warning", "possible-double-charge", "payment", b.id,
          `two ${money(origB)} processor charges on invoice ${invoiceId} within 10 minutes (${a.id}, ${b.id})`
        );
      }
    }
  }

  // ── Refunds ────────────────────────────────────────────────────────────────
  const refunds = await prisma.refund.findMany({
    select: {
      id: true,
      companyId: true,
      amount: true,
      reversalRef: true,
      payment: { select: { id: true, processorRef: true } },
    },
  });
  for (const r of refunds) {
    if (num(r.amount) <= 0) {
      add(
        r.companyId, "error", "refund-amount", "refund", r.id,
        `refund on payment ${r.payment.id} has non-positive amount ${money(num(r.amount))}`
      );
    }
    if (r.payment.processorRef && !r.reversalRef) {
      add(
        r.companyId, "warning", "refund-no-reversal", "refund", r.id,
        `refund on processor payment ${r.payment.id} has no Finix reversal id`
      );
    }
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const subs = await prisma.subscription.findMany({
    select: {
      id: true,
      companyId: true,
      name: true,
      status: true,
      interval: true,
      billPerVisit: true,
      consolidateMonthly: true,
      nextRunDate: true,
      contact: { select: { companyId: true } },
    },
  });
  for (const s of subs) {
    if (s.interval && s.billPerVisit) {
      add(
        s.companyId, "error", "subscription-shape", "subscription", s.id,
        `"${s.name}": interval and billPerVisit are both set (mutually exclusive)`
      );
    }
    if (s.consolidateMonthly && !s.billPerVisit) {
      add(
        s.companyId, "error", "subscription-shape", "subscription", s.id,
        `"${s.name}": consolidateMonthly without billPerVisit`
      );
    }
    if (
      s.status === "ACTIVE" &&
      s.interval &&
      s.nextRunDate &&
      now.getTime() - s.nextRunDate.getTime() > 48 * 3600_000
    ) {
      add(
        s.companyId, "error", "billing-behind", "subscription", s.id,
        `"${s.name}": nextRunDate ${s.nextRunDate.toISOString().slice(0, 10)} is > 48h overdue — is the hourly cron running?`
      );
    }
    if (s.contact.companyId !== s.companyId) {
      add(
        s.companyId, "error", "cross-tenant", "subscription", s.id,
        `"${s.name}": linked contact belongs to a different company`
      );
    }
  }

  // Engine double-bill: two scheduled-plan invoices inside one 20h window.
  const planIds = subs.filter((s) => s.interval).map((s) => s.id);
  if (planIds.length) {
    const engineInvoices = await prisma.invoice.findMany({
      where: {
        subscriptionId: { in: planIds },
        jobId: null,
        createdAt: { gte: new Date(now.getTime() - 40 * 86400_000) },
      },
      select: { id: true, companyId: true, subscriptionId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const bySub = new Map<string, typeof engineInvoices>();
    for (const inv of engineInvoices) {
      const list = bySub.get(inv.subscriptionId!) ?? [];
      list.push(inv);
      bySub.set(inv.subscriptionId!, list);
    }
    for (const [subId, list] of bySub) {
      for (let i = 1; i < list.length; i++) {
        if (
          list[i].createdAt.getTime() - list[i - 1].createdAt.getTime() <
          20 * 3600_000
        ) {
          add(
            list[i].companyId, "error", "double-bill", "subscription", subId,
            `plan billed twice within 20h (invoices ${list[i - 1].id}, ${list[i].id})`
          );
        }
      }
    }
  }

  // ── Contact card mirror ────────────────────────────────────────────────────
  // Legacy Contact.processorCustomerRef must mirror the default SavedCard —
  // autopay's fallback chain reads both, so drift means the wrong card charges.
  const mirroredContacts = await prisma.contact.findMany({
    where: { processorCustomerRef: { not: null } },
    select: {
      id: true,
      companyId: true,
      processorCustomerRef: true,
      savedCards: {
        where: { isDefault: true },
        select: { instrumentRef: true },
        take: 1,
      },
    },
  });
  for (const c of mirroredContacts) {
    const def = c.savedCards[0];
    if (def && def.instrumentRef !== c.processorCustomerRef) {
      add(
        c.companyId, "warning", "card-mirror-drift", "contact", c.id,
        `legacy card mirror (${c.processorCustomerRef}) ≠ default saved card (${def.instrumentRef})`
      );
    }
  }

  // ── Finix cross-check ──────────────────────────────────────────────────────
  if (finix.finixConfigured()) {
    const toCheck = recentProcessorPayments
      .filter(
        (p) =>
          p.processorRef?.startsWith("TR") &&
          now.getTime() - p.createdAt.getTime() < FINIX_LOOKBACK_MS
      )
      .slice(0, FINIX_MAX_LOOKUPS);
    for (const p of toCheck) {
      try {
        const transfer = await finix.getTransfer(p.processorRef!);
        const originalCharge =
          num(p.amount) + p.refunds.reduce((s, r) => s + num(r.amount), 0);
        const expectedCents = Math.round(originalCharge * 100);
        if (transfer.amount !== expectedCents) {
          add(
            p.companyId, "error", "finix-amount-mismatch", "payment", p.id,
            `recorded ${money(originalCharge)} but Finix transfer ${p.processorRef} moved ${money(transfer.amount / 100)}`
          );
        }
        if (transfer.state === "FAILED" || transfer.state === "CANCELED") {
          add(
            p.companyId, "error", "finix-state-mismatch", "payment", p.id,
            `payment recorded but Finix transfer ${p.processorRef} is ${transfer.state} — money did not move`
          );
        }
      } catch (err) {
        add(
          p.companyId, "warning", "finix-lookup-failed", "payment", p.id,
          `could not verify transfer ${p.processorRef}: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }
  }

  return { findings, companies: companies.length, invoicesChecked: invoices.length };
}

/**
 * Email the report to the platform operator: always when something drifted,
 * and a Monday "all clean" heartbeat so silence is never ambiguous. Recipient
 * = RECONCILE_ALERT_EMAIL, else the oldest superadmin account.
 */
async function maybeSendReport(
  now: Date,
  findings: ReconcileFinding[],
  stats: { companies: number; invoicesChecked: number }
): Promise<string | null> {
  const isMonday = now.getUTCDay() === 1;
  if (findings.length === 0 && !isMonday) return null;

  let to = process.env.RECONCILE_ALERT_EMAIL ?? null;
  if (!to) {
    const superadmin = await prisma.user.findFirst({
      where: { role: "SUPERADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { email: true },
    });
    to = superadmin?.email ?? null;
  }
  if (!to) return null;

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const subject = findings.length
    ? `Workbench reconciliation: ${errors.length} error(s), ${warnings.length} warning(s)`
    : `Workbench reconciliation: all clean (${stats.invoicesChecked} invoices)`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = (list: ReconcileFinding[]) =>
    list
      .map(
        (f) =>
          `<tr><td style="padding:4px 8px;white-space:nowrap">${esc(f.companyName)}</td>` +
          `<td style="padding:4px 8px;white-space:nowrap">${esc(f.check)}</td>` +
          `<td style="padding:4px 8px">${esc(f.detail)}<br><span style="color:#6b7280;font-size:12px">${esc(f.entity)} ${esc(f.entityId)}</span></td></tr>`
      )
      .join("");
  const table = (title: string, list: ReconcileFinding[], color: string) =>
    list.length
      ? `<h3 style="color:${color};margin:16px 0 4px">${title} (${list.length})</h3>` +
        `<table style="border-collapse:collapse;font-size:13px" border="1" cellspacing="0" bordercolor="#e5e7eb">${rows(list)}</table>`
      : "";

  const html =
    `<p>Nightly reconciliation sweep — ${stats.invoicesChecked} invoices across ${stats.companies} companies.</p>` +
    (findings.length
      ? table("Errors", errors, "#dc2626") + table("Warnings", warnings, "#d97706")
      : `<p style="color:#16a34a"><strong>All invariants hold.</strong></p>`);

  const sent = await sendEmail({ to, subject, html }).catch((err) => {
    console.error("[reconcile] report email failed", err);
    return false;
  });
  return sent ? to : null;
}
