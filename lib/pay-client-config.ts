import { getProcessor } from "@/lib/payments";
import { canChargeOnline, type ChargeGateCompany } from "@/lib/payments-gate";
import { finixApplicationId, finixEnvironment } from "@/lib/finix";
import { squareApplicationId, squareEnvironment } from "@/lib/square";
import type { ClientPayConfig } from "@/lib/pay-config";

/** The Company columns `clientPayConfig` reads — spread into any select. */
export const PAY_CONFIG_SELECT = {
  finixMerchantId: true,
  finixOnboardingState: true,
  squareMerchantId: true,
  squareConnectedAt: true,
  squareLocationId: true,
} as const;

export type PayConfigCompany = ChargeGateCompany & { squareLocationId: string | null };

/**
 * The browser-side tokenizer config for a company, or null when it can't
 * charge online right now (lib/payments-gate.ts canChargeOnline is the one
 * rule). Server only — reads env; the result is safe to serialize.
 */
export function clientPayConfig(company: PayConfigCompany): ClientPayConfig {
  if (!canChargeOnline(company)) return null;
  const processor = getProcessor();
  if (processor.name === "square") {
    if (!company.squareLocationId) return null;
    return {
      processor: "square",
      applicationId: squareApplicationId(),
      locationId: company.squareLocationId,
      environment: squareEnvironment(),
    };
  }
  if (processor.name === "finix") {
    return { processor: "finix", applicationId: finixApplicationId(), environment: finixEnvironment() };
  }
  return null;
}
