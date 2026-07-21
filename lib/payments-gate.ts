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
