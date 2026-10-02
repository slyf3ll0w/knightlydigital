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
 */
export type PaymentsGateStatus = "off" | "activate" | "pending" | "rejected" | "approved";

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
 * approves them.
 */
export function onlinePaymentsHeld(company: {
  paymentsWaived: boolean;
  finixOnboardingState: string | null;
  /** Superadmin "Test" flag (Company.isTest). */
  isTest?: boolean;
}): boolean {
  if (company.finixOnboardingState === "APPROVED") return false;
  // A company the superadmin marked Test may open the SANDBOX Finix form while
  // onboarding is closed for everyone else — that's how a $1.02 decline or a
  // refund gets exercised on prod without reopening the gate (David
  // 2026-10-02). Never in live mode: a test account must not reach real KYC.
  if (company.isTest && finixEnvironment() === "sandbox") return false;
  return !paymentsOnboardingOpen() || company.paymentsWaived;
}

/**
 * Can this company take a card or bank payment right now? The one four-part
 * test every client-facing pay surface should use: platform processor is
 * Finix and live, and this company's merchant is approved.
 */
export function canChargeOnline(company: {
  finixMerchantId: string | null;
  finixOnboardingState: string | null;
}): boolean {
  const processor = getProcessor();
  return (
    processor.name === "finix" &&
    processor.live &&
    Boolean(company.finixMerchantId) &&
    company.finixOnboardingState === "APPROVED"
  );
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
