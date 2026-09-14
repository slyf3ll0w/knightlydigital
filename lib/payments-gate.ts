import { getProcessor } from "@/lib/payments";
import { finixConfigured } from "@/lib/finix";

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

export function paymentsGateEnabled(): boolean {
  return getProcessor().name === "finix" && finixConfigured();
}

/**
 * "Online payments: coming soon." A company let in past underwriting (the
 * universal invite code, a minted invite, or a superadmin waiver) hasn't
 * been approved to move money, so every surface that offers card/bank
 * payment steps aside: the Settings card says Coming soon instead of opening
 * the Finix form, pay pages are view-only, invoice emails say View. Clears
 * the moment Finix approves them (after a superadmin requires verification).
 */
export function onlinePaymentsHeld(company: {
  paymentsWaived: boolean;
  finixOnboardingState: string | null;
}): boolean {
  return company.paymentsWaived && company.finixOnboardingState !== "APPROVED";
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
