/**
 * Shared status labels + badge colors for the work lifecycle:
 * Request → Quote → Job → Invoice → Payment
 */

export const requestStatusLabel: Record<string, string> = {
  NEW: "New",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

export const requestStatusColor: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONVERTED: "bg-green-100 text-green-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

export const quoteStatusLabel: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_RESPONSE: "Awaiting Response",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

export const quoteStatusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  AWAITING_RESPONSE: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

export const jobStatusLabel: Record<string, string> = {
  ACTIVE: "Active",
  REQUIRES_INVOICING: "Requires Invoicing",
  ARCHIVED: "Archived",
};

export const jobStatusColor: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-700",
  REQUIRES_INVOICING: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

export const invoiceStatusLabel: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_PAYMENT: "Awaiting Payment",
  PAID: "Paid",
  PAST_DUE: "Past Due",
};

export const invoiceStatusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  AWAITING_PAYMENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  PAST_DUE: "bg-red-100 text-red-700",
};

export const contactStatusLabel: Record<string, string> = {
  LEAD: "Lead",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const contactStatusColor: Record<string, string> = {
  LEAD: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-green-100 text-green-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
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
