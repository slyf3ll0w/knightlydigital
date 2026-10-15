import type { LoadedBookingType } from "@/lib/booking-runtime";
import { clientPayConfig, type PayConfigCompany } from "@/lib/pay-client-config";
import type { BookingPaymentConfig } from "@/app/book/[slug]/schedule/[type]/BookingStepper";

/**
 * What the public booking page needs to take a card for a paid SERVICE
 * type: the browser tokenizer config (lib/pay-client-config.ts — public ids
 * only; merchant/onboarding ids never ride into HTML), the surcharge rate,
 * and the deposit rules so the page can show the amount before the card
 * step. Data only — it crosses the server→client boundary.
 */
export function bookingPaymentConfig(
  type: LoadedBookingType,
  company: PayConfigCompany & {
    surchargeEnabled: boolean;
    surchargeRate: { toString(): string } | number | null;
    defaultDepositType: "NONE" | "PERCENT" | "FIXED" | "FULL";
    defaultDepositValue: { toString(): string } | number | null;
  }
): BookingPaymentConfig | undefined {
  if (type.kind !== "SERVICE" || type.paymentMode === "NONE") return undefined;
  return {
    pay: clientPayConfig(company),
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
