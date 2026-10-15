/**
 * What a browser needs to tokenize a card for a company — the one shape
 * every client-facing payment surface takes (pay page, booking, client hub,
 * staff card forms). Built server-side by lib/pay-client-config.ts, which
 * decides whether the company can charge at all; null = no online payment.
 *
 * Only PUBLIC identifiers ride here (they're serialized into page HTML):
 * the platform's application id and, for Square, the seller's location id.
 * Merchant ids, onboarding states and tokens never do.
 *
 * Client-safe: no server imports. The Finix/Square window types live in
 * lib/finix-js.ts and lib/square-js.ts.
 */
export type FinixClientConfig = { processor: "finix"; applicationId: string; environment: "sandbox" | "live" };
export type SquareClientConfig = {
  processor: "square";
  applicationId: string;
  locationId: string;
  environment: "sandbox" | "production";
};
export type ClientPayConfig = FinixClientConfig | SquareClientConfig | null;

export function isTestMode(pay: ClientPayConfig): boolean {
  return pay?.environment === "sandbox";
}

/** "Payments secured by …" */
export function processorLabel(pay: ClientPayConfig): string {
  if (pay?.processor === "square") return "Square";
  if (pay?.processor === "finix") return "Finix";
  return "";
}
