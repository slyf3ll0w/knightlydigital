import { getProcessor } from "@/lib/payments";
import { finixConfigured, finixEnvironment } from "@/lib/finix";

/**
 * The payment-verification gate: WorkBench is monetized by processing fees, so
 * every new company must complete Finix underwriting (KYC/KYB) before using
 * the app. The platform layout redirects gated companies to /app/activate.
 *
 * States:
 *  - off       gate not applicable (processor isn't Finix, or company waived)
 *  - activate  hosted onboarding form not completed yet — hard gate
 *  - pending   form done, merchant PROVISIONING / UPDATE_REQUESTED — company
 *              may use the app (banner shown); charging is structurally
 *              impossible until APPROVED, so nothing can move money early
 *  - rejected  Finix declined the business — hard gate, locked screen
 *  - approved  underwriting passed, full access
 *
 * **Square (PAYMENT_PROCESSOR=square, 2026-10):** there is no underwriting on
 * our side at all — the seller brings their own Square account and connects
 * it from Settings (lib/square-connection.ts). The gate is always `off`,
 * nothing is "held", and `canChargeOnline` is simply "is Square connected".
 */
export type PaymentsGateStatus = "off" | "activate" | "pending" | "rejected" | "approved";

/** The Company columns every charge gate reads — spread into selects so a
 *  caller can never forget the Square half (the type below REQUIRES them). */
export const CHARGE_GATE_SELECT = {
  finixMerchantId: true,
  finixOnboardingState: true,
  squareMerchantId: true,
  squareConnectedAt: true,
} as const;

export type ChargeGateCompany = {
  finixMerchantId: string | null;
  finixOnboardingState: string | null;
  squareMerchantId: string | null;
  squareConnectedAt: Date | string | null;
};

/**
 * Is Finix onboarding open to new companies? Closed by default (2026-09-30,
 * the first real users): no underwriting gate at signup, and every company
 * Finix hasn't already approved gets Online payments "Coming soon" — no
 * Finix form, no pay button. Companies already APPROVED keep taking
 * payments. `PAYMENTS_ONBOARDING_OPEN=1` restores the gate and the form.
 */
export function paymentsOnboardingOpen(): boolean {
  return process.env.PAYMENTS_ONBOARDING_OPEN === "1";
}

export function paymentsGateEnabled(): boolean {
  return paymentsOnboardingOpen() && getProcessor().name === "finix" && finixConfigured();
}

/**
 * "Online payments: coming soon." A company that hasn't been approved to move
 * money — any company while onboarding is closed, or one let in past
 * underwriting (the universal invite code, a minted invite, or a superadmin
 * waiver) — sees the Settings card say Coming soon instead of opening the
 * Finix form. Client-facing surfaces key off canChargeOnline, so their pay
 * pages are view-only and invoice emails say View. Clears the moment Finix
 * approves them. Never held on Square: connecting is self-serve.
 */
export function onlinePaymentsHeld(company: {
  paymentsWaived: boolean;
  finixOnboardingState: string | null;
  /** Superadmin "Test" flag (Company.isTest). */
  isTest?: boolean;
}): boolean {
  if (getProcessor().name === "square") return false;
  if (company.finixOnboardingState === "APPROVED") return false;
  // A company the superadmin marked Test may open the SANDBOX Finix form while
  // onboarding is closed for everyone else — that's how a $1.02 decline or a
  // refund gets exercised on prod without reopening the gate (David
  // 2026-10-02). Never in live mode: a test account must not reach real KYC.
  if (company.isTest && finixEnvironment() === "sandbox") return false;
  return !paymentsOnboardingOpen() || company.paymentsWaived;
}

/**
 * Can this company take a card or bank payment right now? The one test every
 * client-facing pay surface should use: the platform processor is live AND
 * this company's account on it is ready — a Finix merchant that passed
 * underwriting, or a connected Square account.
 */
export function canChargeOnline(company: ChargeGateCompany): boolean {
  const processor = getProcessor();
  if (!processor.live) return false;
  if (processor.name === "square") {
    return Boolean(company.squareMerchantId) && company.squareConnectedAt != null;
  }
  return (
    processor.name === "finix" &&
    Boolean(company.finixMerchantId) &&
    company.finixOnboardingState === "APPROVED"
  );
}

/** The company's account id on the active processor — what a charge passes
 *  as `merchantRef` (Finix merchant MUxxx, or the Square merchant id). */
export function processorMerchantRef(company: ChargeGateCompany): string | undefined {
  const processor = getProcessor();
  if (processor.name === "square") return company.squareMerchantId ?? undefined;
  if (processor.name === "finix") return company.finixMerchantId ?? undefined;
  return undefined;
}

/** The contact's buyer record on the active processor (Finix identity
 *  IDxxx / Square customer id) — what a charge passes as `buyer.identityRef`. */
export function buyerIdentityRefOf(contact: {
  finixBuyerIdentityId: string | null;
  squareCustomerId: string | null;
}): string | null {
  const processor = getProcessor();
  if (processor.name === "square") return contact.squareCustomerId;
  if (processor.name === "finix") return contact.finixBuyerIdentityId;
  return null;
}

/** The Contact column a freshly minted buyer ref belongs in. */
export function buyerIdentityData(ref: string): { finixBuyerIdentityId: string } | { squareCustomerId: string } | null {
  const processor = getProcessor();
  if (processor.name === "square") return { squareCustomerId: ref };
  if (processor.name === "finix") return { finixBuyerIdentityId: ref };
  return null;
}

export function paymentsGateStatus(company: {
  paymentsWaived: boolean;
  finixOnboardingState: string | null;
}): PaymentsGateStatus {
  if (!paymentsGateEnabled() || company.paymentsWaived) return "off";
  switch (company.finixOnboardingState) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PROVISIONING":
    case "UPDATE_REQUESTED":
      return "pending";
    default:
      return "activate";
  }
}
