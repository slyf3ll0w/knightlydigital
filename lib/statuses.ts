/**
 * Shared status labels + tones for the work lifecycle:
 * Request → Quote → Job → Invoice → Payment
 *
 * One color system everywhere (render via <StatusChip>):
 *   green = done/positive (paid, approved, active, converted)
 *   amber = waiting on someone (awaiting response/payment, new request, lead)
 *   red   = needs attention (past due, changes requested)
 *   gray  = inert (draft, archived)
 */

export type StatusTone = "green" | "amber" | "red" | "gray" | "blue";
export type StatusKind =
  | "request"
  | "quote"
  | "job"
  | "invoice"
  | "contact"
  | "appointment"
  | "contract"
  | "message";

export const requestStatusLabel: Record<string, string> = {
  NEW: "New",
  NEEDS_APPROVAL: "Needs approval",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

export const quoteStatusLabel: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_RESPONSE: "Awaiting Response",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

export const jobStatusLabel: Record<string, string> = {
  ACTIVE: "Active",
  REQUIRES_INVOICING: "Requires Invoicing",
  // "Closed", not "Archived" — to an owner, a paid job that says ARCHIVED
  // reads like it was deleted or filed away by mistake.
  ARCHIVED: "Closed",
};

export const invoiceStatusLabel: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_PAYMENT: "Awaiting Payment",
  PAID: "Paid",
  PAST_DUE: "Past Due",
};

export const contactStatusLabel: Record<string, string> = {
  LEAD: "Lead",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const appointmentStatusLabel: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

export const appointmentTypeLabel: Record<string, string> = {
  PHONE_CALL: "Phone call",
  VIDEO_CALL: "Video call",
  IN_PERSON: "In-person",
};

export const contractStatusLabel: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Awaiting Signature",
  SIGNED: "Signed",
  VOID: "Void",
};

// Client emails (ClientMessage): derived, not stored — see clientMessageStatus.
// The ladder is honest about signal strength: LIKELY_OPENED = Apple's privacy
// proxy auto-loaded the images (may not be a real read), OPENED = a real mail
// client fetched images, VIEWED = they opened the online message page (certain).
export const messageStatusLabel: Record<string, string> = {
  SENT: "Sent",
  LIKELY_OPENED: "Likely opened",
  OPENED: "Opened",
  VIEWED: "Viewed",
};

/** Strongest open signal wins: page view > confident pixel > Apple-proxy pixel. */
export function clientMessageStatus(m: {
  firstViewedAt: Date | string | null;
  emailOpenKind: string | null;
}): string {
  if (m.firstViewedAt) return "VIEWED";
  if (m.emailOpenKind === "confident") return "OPENED";
  if (m.emailOpenKind === "likely") return "LIKELY_OPENED";
  return "SENT";
}

export const statusLabels: Record<StatusKind, Record<string, string>> = {
  request: requestStatusLabel,
  quote: quoteStatusLabel,
  job: jobStatusLabel,
  invoice: invoiceStatusLabel,
  contact: contactStatusLabel,
  appointment: appointmentStatusLabel,
  contract: contractStatusLabel,
  message: messageStatusLabel,
};

export const statusTones: Record<StatusKind, Record<string, StatusTone>> = {
  request: { NEW: "amber", NEEDS_APPROVAL: "red", CONVERTED: "green", ARCHIVED: "gray" },
  quote: {
    DRAFT: "gray",
    AWAITING_RESPONSE: "amber",
    APPROVED: "green",
    CHANGES_REQUESTED: "red",
    CONVERTED: "green",
    ARCHIVED: "gray",
  },
  job: { ACTIVE: "green", REQUIRES_INVOICING: "amber", ARCHIVED: "gray" },
  invoice: { DRAFT: "gray", AWAITING_PAYMENT: "amber", PAID: "green", PAST_DUE: "red" },
  contact: { LEAD: "amber", ACTIVE: "green", ARCHIVED: "gray" },
  // blue = upcoming commitment (distinct from job-status greens/ambers)
  appointment: { SCHEDULED: "blue", COMPLETED: "green", CANCELLED: "gray", NO_SHOW: "red" },
  contract: { DRAFT: "gray", SENT: "amber", SIGNED: "green", VOID: "gray" },
  message: { SENT: "amber", LIKELY_OPENED: "blue", OPENED: "green", VIEWED: "green" },
};

export const paymentMethodLabel: Record<string, string> = {
  CARD: "Credit/debit card",
  ACH: "Bank payment (ACH)",
  CASH: "Cash",
  CHECK: "Check",
  CASH_APP: "Cash App",
  PAYPAL: "PayPal",
  VENMO: "Venmo",
  ZELLE: "Zelle",
  OTHER: "Other",
};

export function money(n: number | string | { toString(): string } | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Convert a datetime-local input value ("2026-06-11T08:00") to an ISO string
 * using the browser's timezone. Always do this client-side before sending —
 * the raw string is ambiguous and the server would store it in its own zone.
 */
export function localInputToISO(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Deposit owed on a quote, given its totals and deposit settings. */
export function quoteDepositAmount(q: {
  total: number | { toString(): string };
  depositType: string;
  depositValue: number | { toString(): string } | null;
}): number {
  const total = Number(q.total);
  const value = Number(q.depositValue ?? 0);
  if (q.depositType === "PERCENT") return Math.round(total * (value / 100) * 100) / 100;
  if (q.depositType === "FIXED") return Math.min(value, total);
  if (q.depositType === "FULL") return total;
  return 0;
}

// ─── Per-service deposit derivation ──────────────────────────────────────────

export type DepositRule = {
  depositType: string;
  depositValue: number | { toString(): string } | null;
};

/** Is a deposit rule actually set (not NONE/empty)? */
export function hasDeposit(rule: DepositRule | null | undefined): boolean {
  return !!rule && rule.depositType !== "NONE" && !!rule.depositType;
}

/**
 * Deposit owed on a single line, given its rule and an optional fallback
 * (the company default). A preset service with no rule of its own inherits the
 * fallback; PERCENT/FIXED are of the line total, FULL is the whole line.
 */
export function lineDepositAmount(
  lineTotal: number,
  rule: DepositRule | null | undefined,
  fallback?: DepositRule | null
): number {
  let type = rule?.depositType ?? "NONE";
  let value = Number(rule?.depositValue ?? 0);
  if ((type === "NONE" || !type) && hasDeposit(fallback)) {
    type = fallback!.depositType;
    value = Number(fallback!.depositValue ?? 0);
  }
  if (type === "PERCENT") return Math.round(lineTotal * (value / 100) * 100) / 100;
  if (type === "FIXED") return Math.min(value, lineTotal);
  if (type === "FULL") return lineTotal;
  return 0;
}

/**
 * Sum per-service deposits across a quote's preset lines, capped at the total.
 * Each entry passes its own deposit rule (null for custom/free-typed lines,
 * which contribute nothing automatically); preset lines fall back to the
 * company default. Returns a single dollar amount snapshotted onto the quote
 * as a FIXED deposit.
 */
export function derivedQuoteDeposit(
  lines: { total: number; deposit: DepositRule | null }[],
  total: number,
  companyDefault?: DepositRule | null
): number {
  let sum = 0;
  for (const li of lines) {
    if (li.deposit === null) continue; // custom line — no automatic deposit
    sum += lineDepositAmount(Number(li.total), li.deposit, companyDefault);
  }
  return Math.min(Math.round(sum * 100) / 100, Math.round(total * 100) / 100);
}
