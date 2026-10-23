import type { PublicQuote } from "@/app/quote/[token]/QuoteAcceptPage";
import type { PublicInvoice } from "@/app/pay/[token]/PayPage";

/**
 * Brightwire Electric — the FAKE company every client-facing surface is
 * reviewed on (/app/design/client and /client-preview). Never a real
 * client of WorkBench (feedback-no-real-clients-in-marketing).
 */

export type FixtureBrand = "default" | "navy" | "yellow" | "black";

const BRANDS: Record<FixtureBrand, { brandColor: string | null; brandColorSecondary: string | null; documentColor: string | null }> = {
  default: { brandColor: null, brandColorSecondary: null, documentColor: null },
  navy: { brandColor: "#0A1428", brandColorSecondary: "#F86808", documentColor: null },
  yellow: { brandColor: "#FDE047", brandColorSecondary: null, documentColor: null },
  black: { brandColor: "#111111", brandColorSecondary: "#FFFFFF", documentColor: null },
};

export function fixtureCompany(brand: FixtureBrand = "navy") {
  return {
    name: "Brightwire Electric",
    phone: "(469) 555-0142",
    email: "hello@brightwire-electric.example",
    address: "1180 Greenville Ave, Suite 210",
    city: "Allen",
    state: "TX",
    zip: "75002",
    logoUrl: null,
    ...BRANDS[brand],
    surchargeEnabled: true,
    surchargeRate: 0.03,
  };
}

const CONTACT = {
  firstName: "Sarah",
  lastName: "Henderson",
  email: "sarah.henderson@example.com",
  phone: "(214) 555-0188",
  address: "14 Oak Court",
  city: "Allen",
  state: "TX",
  zip: "75013",
};

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

export function fixtureQuote(state: "open" | "approved" | "expired" | "withdrawn" = "open", brand: FixtureBrand = "navy"): PublicQuote {
  const items = [
    { id: "li1", name: "Panel upgrade, 200A", description: "Replace the existing 100A panel with a 200A Square D panel, new main breaker and grounding to code.", quantity: 1, unitPrice: 2400, total: 2400, isOptional: false, optedOut: false },
    { id: "li2", name: "City permit and inspection", description: "", quantity: 1, unitPrice: 180, total: 180, isOptional: false, optedOut: false },
    { id: "li3", name: "Whole-home surge protector", description: "Eaton CHSPT2 installed at the panel.", quantity: 1, unitPrice: 320, total: 320, isOptional: true, optedOut: false },
    { id: "li4", name: "EV charger circuit (50A)", description: "Conduit run to the garage, NEMA 14-50 outlet.", quantity: 1, unitPrice: 650, total: 650, isOptional: true, optedOut: true },
  ];
  const included = items.filter((i) => !i.optedOut);
  const subtotal = included.reduce((s, i) => s + i.total, 0);
  const tax = Math.round(subtotal * 0.0825 * 100) / 100;
  return {
    id: "q_preview",
    publicToken: "preview",
    quoteNumber: 1042,
    title: "Panel upgrade at 14 Oak Court",
    status: state === "approved" ? "APPROVED" : state === "withdrawn" ? "ARCHIVED" : "AWAITING_RESPONSE",
    subtotal,
    discountType: "NONE",
    discountValue: null,
    taxRate: 0.0825,
    tax,
    total: subtotal + tax,
    depositType: "PERCENT",
    depositValue: 30,
    clientMessage:
      "Hi Sarah — thanks for having us out Tuesday. Here's the estimate for the panel work we talked about. The surge protector and EV circuit are optional; tick whichever you'd like included and the total updates. Happy to answer anything.",
    disclaimer:
      "Estimate valid for 30 days. Work is scheduled on deposit. Any additional work found once the panel is open is quoted before it is done. Brightwire Electric is licensed and insured (TECL 00000).",
    validUntil: state === "expired" ? iso(-3) : iso(27),
    sentAt: iso(-2),
    createdAt: iso(-2),
    signatureName: state === "approved" ? "Sarah Henderson" : null,
    approvedAt: state === "approved" ? iso(-1) : null,
    contact: CONTACT,
    company: fixtureCompany(brand),
    lineItems: items,
  };
}

export function fixtureInvoice(state: "open" | "paid" | "partial" | "withdrawn" = "open", brand: FixtureBrand = "navy"): PublicInvoice {
  const items = [
    { id: "ii1", name: "Panel upgrade, 200A", description: "Replace the existing 100A panel with a 200A Square D panel, new main breaker and grounding to code.", quantity: 1, unitPrice: 2400, total: 2400, recurringInterval: null },
    { id: "ii2", name: "City permit and inspection", description: "", quantity: 1, unitPrice: 180, total: 180, recurringInterval: null },
    { id: "ii3", name: "Whole-home surge protector", description: "Eaton CHSPT2 installed at the panel.", quantity: 1, unitPrice: 320, total: 320, recurringInterval: null },
  ];
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const tax = Math.round(subtotal * 0.0825 * 100) / 100;
  // The invoice total is NET of the deposit (the ledger shows "Deposit applied" as a deduction)
  const gross = Math.round((subtotal + tax) * 100) / 100;
  const deposit = Math.round(gross * 0.3 * 100) / 100;
  const total = Math.round((gross - deposit) * 100) / 100;
  const payments =
    state === "paid"
      ? [{ id: "p1", amount: total, surchargeAmount: 0, method: "ACH", paidAt: iso(-1) }]
      : state === "partial"
        ? [{ id: "p2", amount: 500, surchargeAmount: 15, method: "CARD", paidAt: iso(-1) }]
        : [];
  return {
    id: "i_preview",
    invoiceNumber: 2210,
    status: state === "paid" ? "PAID" : state === "withdrawn" ? "ARCHIVED" : "AWAITING_PAYMENT",
    kind: "FINAL",
    publicToken: "preview",
    subtotal,
    discount: null,
    tax,
    surcharge: null,
    depositApplied: deposit,
    total,
    notes: "Thank you for choosing Brightwire. Your panel carries a 5-year workmanship warranty.",
    clientMessage: "The panel passed inspection this morning — everything's buttoned up. Here's the final invoice with your deposit applied.",
    dueDate: iso(12),
    issuedAt: iso(0),
    createdAt: iso(0),
    contact: CONTACT,
    company: fixtureCompany(brand),
    lineItems: items,
    payments,
  };
}

/** What the pay page would be asked to charge for a fixture state (mirrors lib/payments invoiceBalance). */
export function fixtureBalance(inv: PublicInvoice): number {
  const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
  const surcharges = inv.payments.reduce((s, p) => s + Number(p.surchargeAmount ?? 0), 0);
  return Math.max(0, Math.round((Number(inv.total) + surcharges - paid) * 100) / 100);
}
