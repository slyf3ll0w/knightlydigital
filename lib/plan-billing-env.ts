import { squareApplicationId } from "@/lib/square";

/**
 * Where plan billing's Square credentials come from (lib/plan-billing.ts,
 * lib/plan-catalog.ts). Split out so the catalog reader and the billing
 * module can import it without importing each other.
 *
 *  SQUARE_BILLING_ACCESS_TOKEN   WorkBench's OWN account's access token for
 *                                the SQUARE_ENVIRONMENT in use (Developer
 *                                Console → the WorkBench application →
 *                                Credentials → Production / Sandbox access token)
 *  SQUARE_BILLING_LOCATION_ID    the location subscriptions bill under
 */

export function planBillingToken(): string {
  return (process.env.SQUARE_BILLING_ACCESS_TOKEN ?? "").trim();
}

export function planBillingLocationId(): string {
  return (process.env.SQUARE_BILLING_LOCATION_ID ?? "").trim();
}

export function planBillingConfigured(): boolean {
  return Boolean(planBillingToken() && planBillingLocationId() && squareApplicationId());
}
