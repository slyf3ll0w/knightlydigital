/**
 * Plain-language words for Square's enums on the Payments page. Client-safe
 * (no server imports) so the dispute actions component can speak them too.
 */

type Tone = "primary" | "secondary" | "good" | "warn" | "bad" | "neutral";

/** Which Square product took a payment that WorkBench didn't. */
export function squareProductLabel(product: string | null | undefined): string {
  switch (product) {
    case "SQUARE_POS":
      return "Square POS";
    case "ONLINE_STORE":
      return "Square Online";
    case "INVOICES":
      return "Square Invoices";
    case "VIRTUAL_TERMINAL":
      return "Virtual Terminal";
    case "APPOINTMENTS":
      return "Square Appointments";
    case "RETAIL":
      return "Square for Retail";
    case "RESTAURANTS":
      return "Square for Restaurants";
    case "TERMINAL_API":
      return "Square Terminal";
    case "ECOMMERCE_API":
      return "Another app";
    case "OTHER":
    case null:
    case undefined:
      return "Square";
    default:
      return "Square";
  }
}

export function cardBrandLabel(brand: string | null | undefined): string {
  switch (brand) {
    case "VISA":
      return "Visa";
    case "MASTERCARD":
      return "Mastercard";
    case "AMERICAN_EXPRESS":
      return "Amex";
    case "DISCOVER":
      return "Discover";
    case "JCB":
      return "JCB";
    case "DISCOVER_DINERS":
      return "Diners";
    case "UNION_PAY":
      return "UnionPay";
    case "SQUARE_GIFT_CARD":
      return "Gift card";
    case "EBT":
      return "EBT";
    case "INTERAC":
      return "Interac";
    default:
      return brand ? brand.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "Card";
  }
}

/** "Visa ····4242" / "Bank ····6789" / "Cash" */
export function paymentSourceLabel(p: { sourceType: string | null; cardBrand: string | null; last4: string | null }): string {
  if (p.sourceType === "BANK_ACCOUNT") return p.last4 ? `Bank ····${p.last4}` : "Bank";
  if (p.sourceType === "CASH") return "Cash";
  if (p.sourceType === "EXTERNAL") return "Other";
  if (p.sourceType === "WALLET") return "Wallet";
  const brand = cardBrandLabel(p.cardBrand);
  return p.last4 ? `${brand} ····${p.last4}` : brand;
}

export function squarePaymentStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "COMPLETED":
      return { label: "Paid", tone: "good" };
    case "APPROVED":
    case "PENDING":
      return { label: "Processing", tone: "primary" };
    case "FAILED":
      return { label: "Failed", tone: "bad" };
    case "CANCELED":
      return { label: "Canceled", tone: "neutral" };
    default:
      return { label: status.toLowerCase(), tone: "neutral" };
  }
}

export function payoutStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "PAID":
      return { label: "Paid out", tone: "good" };
    case "SENT":
      return { label: "On the way", tone: "primary" };
    case "FAILED":
      return { label: "Failed", tone: "bad" };
    default:
      return { label: status.toLowerCase(), tone: "neutral" };
  }
}

export function payoutDestinationLabel(p: { destinationType: string | null; destinationLast4: string | null; type: string | null }): string {
  const where =
    p.destinationType === "CARD"
      ? "Debit card"
      : p.destinationType === "SQUARE_BALANCE" || p.destinationType === "SQUARE_STORED_BALANCE"
        ? "Square balance"
        : "Bank";
  const last4 = p.destinationLast4 ? ` ····${p.destinationLast4}` : "";
  const how = p.type === "SIMPLE" ? " · instant transfer" : "";
  return `${where}${last4}${how}`;
}

export function payoutEntryTypeLabel(type: string): string {
  switch (type) {
    case "CHARGE":
      return "Payment";
    case "REFUND":
      return "Refund";
    case "DISPUTE":
    case "OPEN_DISPUTE":
      return "Dispute";
    case "DISPUTE_REVERSED":
    case "OPEN_DISPUTE_REVERSED":
      return "Dispute reversed";
    case "FEE":
    case "DEPOSIT_FEE":
    case "THIRD_PARTY_FEE":
    case "PAID_SERVICE_FEE":
    case "SUBSCRIPTION_FEE":
    case "TAX_ON_FEE":
      return "Fee";
    case "ADJUSTMENT":
    case "OTHER_ADJUSTMENT":
    case "HOLD_ADJUSTMENT":
    case "RELEASE_ADJUSTMENT":
      return "Adjustment";
    case "RESERVE_HOLD":
      return "Reserve held";
    case "RESERVE_RELEASE":
      return "Reserve released";
    case "RETURNED_PAYOUT":
      return "Returned payout";
    case "SQUARE_CAPITAL_PAYMENT":
      return "Square Capital payment";
    case "MONEY_TRANSFER":
      return "Transfer";
    default:
      return type.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function disputeState(state: string): { label: string; tone: Tone; open: boolean } {
  switch (state) {
    case "INQUIRY_EVIDENCE_REQUIRED":
      return { label: "Inquiry — needs evidence", tone: "warn", open: true };
    case "INQUIRY_PROCESSING":
      return { label: "Inquiry — under review", tone: "primary", open: false };
    case "INQUIRY_CLOSED":
      return { label: "Inquiry closed", tone: "neutral", open: false };
    case "EVIDENCE_REQUIRED":
      return { label: "Needs evidence", tone: "bad", open: true };
    case "PROCESSING":
      return { label: "Bank reviewing", tone: "primary", open: false };
    case "WON":
      return { label: "Won", tone: "good", open: false };
    case "LOST":
      return { label: "Lost", tone: "bad", open: false };
    case "ACCEPTED":
      return { label: "Accepted", tone: "neutral", open: false };
    default:
      return { label: state.replaceAll("_", " ").toLowerCase(), tone: "neutral", open: false };
  }
}

export function disputeReasonLabel(reason: string): string {
  switch (reason) {
    case "AMOUNT_DIFFERS":
      return "Amount differs";
    case "CANCELLED":
      return "Cancelled service";
    case "DUPLICATE":
      return "Duplicate charge";
    case "NO_KNOWLEDGE":
      return "Doesn't recognize the charge";
    case "NOT_AS_DESCRIBED":
      return "Not as described";
    case "NOT_RECEIVED":
      return "Not received";
    case "PAID_BY_OTHER_MEANS":
      return "Paid another way";
    case "CUSTOMER_REQUESTS_CREDIT":
      return "Asked for a credit";
    case "EMV_LIABILITY_SHIFT":
      return "Chip card liability";
    default:
      return reason.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

/** The evidence types a field-service business actually has, in the order to offer them. */
/** A gift card's state in words + tone (lib/square-products.ts GiftCardState). */
export function giftCardState(state: string): { label: string; tone: Tone } {
  switch (state) {
    case "ACTIVE":
      return { label: "Active", tone: "good" };
    case "PENDING":
      return { label: "Not paid yet", tone: "warn" };
    case "DEACTIVATED":
      return { label: "Deactivated", tone: "neutral" };
    case "BLOCKED":
      return { label: "Blocked", tone: "bad" };
    default:
      return { label: state.toLowerCase().replace(/_/g, " "), tone: "neutral" };
  }
}

/** What happened to a gift card, in words (GiftCardActivityType). */
export function giftCardActivityLabel(type: string): string {
  switch (type) {
    case "ACTIVATE":
      return "Loaded (new card)";
    case "LOAD":
      return "Loaded";
    case "REDEEM":
      return "Used";
    case "REFUND":
      return "Refund back onto the card";
    case "UNLINKED_ACTIVITY_REFUND":
      return "Refund";
    case "ADJUST_INCREMENT":
      return "Added by hand";
    case "ADJUST_DECREMENT":
      return "Removed by hand";
    case "CLEAR_BALANCE":
      return "Balance cleared";
    case "DEACTIVATE":
      return "Deactivated";
    case "BLOCK":
      return "Blocked";
    case "UNBLOCK":
      return "Unblocked";
    case "IMPORT":
      return "Imported";
    case "IMPORT_REVERSAL":
      return "Import reversed";
    case "TRANSFER_BALANCE_FROM":
      return "Moved to another card";
    case "TRANSFER_BALANCE_TO":
      return "Moved from another card";
    default:
      return type.toLowerCase().replace(/_/g, " ");
  }
}

/** Square's card entry method in words. */
export function entryMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case "KEYED":
      return "Typed in";
    case "SWIPED":
      return "Swiped";
    case "EMV":
      return "Chip";
    case "ON_FILE":
      return "Card on file";
    case "CONTACTLESS":
      return "Tap";
    default:
      return "";
  }
}

export const EVIDENCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "RECEIPT", label: "Invoice or receipt" },
  { value: "SERVICE_RECEIVED_DOCUMENTATION", label: "Proof the work was done (photos, sign-off)" },
  { value: "AUTHORIZATION_DOCUMENTATION", label: "Signed quote or agreement" },
  { value: "CARDHOLDER_COMMUNICATION", label: "Messages with the client" },
  { value: "CANCELLATION_OR_REFUND_DOCUMENTATION", label: "Cancellation or refund terms" },
  { value: "PRODUCT_OR_SERVICE_DESCRIPTION", label: "What was sold" },
  { value: "REBUTTAL_EXPLANATION", label: "Written explanation" },
  { value: "GENERIC_EVIDENCE", label: "Other" },
];

export function evidenceTypeLabel(type: string | null): string {
  return EVIDENCE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? (type ? type.replaceAll("_", " ").toLowerCase() : "Evidence");
}
