import type { LoadedBookingType } from "@/lib/booking-runtime";
import { paymentsLive } from "@/lib/booking-checkout";
import { finixApplicationId, finixEnvironment } from "@/lib/finix";
import type { BookingPaymentConfig } from "@/app/book/[slug]/schedule/[type]/BookingStepper";

/**
 * What the public booking page needs to take a card for a paid SERVICE
 * type: the public finix.js config (application id is public by design;
 * merchant/onboarding ids never ride into HTML), the surcharge rate, and
 * the deposit rules so the page can show the amount before the card step.
 * Data only — it crosses the server→client boundary.
 */
export function bookingPaymentConfig(
  type: LoadedBookingType,
  company: {
    finixMerchantId: string | null;
    finixOnboardingState: string | null;
    surchargeEnabled: boolean;
    surchargeRate: { toString(): string } | number | null;
    defaultDepositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
    defaultDepositValue: { toString(): string } | number | null;
  }
): BookingPaymentConfig | undefined {
  if (type.kind !== "SERVICE" || type.paymentMode === "NONE") return undefined;
  const live = paymentsLive(company);
  return {
    finix: live ? { applicationId: finixApplicationId(), environment: finixEnvironment() } : null,
    surchargeRate: company.surchargeEnabled && company.surchargeRate != null ? Number(company.surchargeRate) : null,
    companyDeposit: {
      depositType: company.defaultDepositType,
      depositValue: company.defaultDepositValue == null ? null : Number(company.defaultDepositValue),
    },
    serviceDeposits: Object.fromEntries(
      type.services.map((s) => [
        s.workItem.id,
        { depositType: s.workItem.depositType, depositValue: s.workItem.depositValue == null ? null : Number(s.workItem.depositValue) },
      ])
    ),
  };
}
