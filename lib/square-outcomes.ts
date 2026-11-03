/**
 * What the Square OAuth callback's `?square=<outcome>` means to the owner
 * (app/api/app/square/callback/route.ts lands on Settings → Online Payments
 * or on the payment-setup step, whichever started the connect). Client-safe:
 * plain strings, no server imports.
 */
export const SQUARE_OUTCOME: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Square is connected — clients can now pay by card or bank from their pay links." },
  denied: { tone: "bad", text: "Square access was declined, so nothing was connected." },
  already_connected_elsewhere: { tone: "bad", text: "That Square account is already connected to another WorkBench company." },
  no_location: { tone: "bad", text: "That Square account has no active location that can take card payments." },
  exchange_failed: { tone: "bad", text: "Square didn't accept the connection. Please try again." },
  merchant_lookup_failed: { tone: "bad", text: "Connected, but Square's business details couldn't be read. Try Check connection." },
  bad_state: { tone: "bad", text: "That connection link had expired. Start again from here." },
  unauthorized: { tone: "bad", text: "Only the account owner can connect Square." },
  missing_params: { tone: "bad", text: "Square sent us back without a code. Please try again." },
};

export function squareOutcomeNotice(outcome: string | null | undefined): { tone: "good" | "bad"; text: string } | null {
  if (!outcome) return null;
  return SQUARE_OUTCOME[outcome] ?? { tone: "bad", text: "Square connection didn't complete. Please try again." };
}
