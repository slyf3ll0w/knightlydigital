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
  | "contract";

export const requestStatusLabel: Record<string, string> = {
  NEW: "New",
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
  ARCHIVED: "Archived",
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

export const statusLabels: Record<StatusKind, Record<string, string>> = {
  request: requestStatusLabel,
  quote: quoteStatusLabel,
  job: jobStatusLabel,
  invoice: invoiceStatusLabel,
  contact: contactStatusLabel,
  appointment: appointmentStatusLabel,
  contract: contractStatusLabel,
};

export const statusTones: Record<StatusKind, Record<string, StatusTone>> = {
  request: { NEW: "amber", CONVERTED: "green", ARCHIVED: "gray" },
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
  return 0;
}
