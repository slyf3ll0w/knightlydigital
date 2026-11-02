/**
 * Which billing category a Square payment token really is (security audit
 * 2026-11-01, finding 2). The pay page used to TELL the server "card" or
 * "bank" and the server priced the client service fee from that word — so a
 * card nonce sent with method "ACH" paid the $1–$8 bank fee on a card charge
 * and the business ate the card rate. The token itself says what it is:
 *
 *   cnon:…  one-time card nonce (Web Payments SDK)      → CARD
 *   ccof:…  card on file                                → CARD
 *   bauth:… bank account authorization (ACH via Plaid)  → ACH
 *
 * Anything else is refused on the Square path. Pure, no imports — shared by
 * the route and its unit test.
 */
import { createHash } from "crypto";

export type PaymentSourceKind = "CARD" | "ACH";

/**
 * The payment-token half of a Square idempotency key: the same one-time
 * token always yields the same key (a retry replays Square's original
 * answer), a different token a different one. No token (never valid for a
 * Square charge, refused upstream) hashes to a fixed word.
 */
export function squareIdempotencySuffix(token: unknown): string {
  return createHash("sha1").update(typeof token === "string" ? token : "no-token").digest("hex").slice(0, 12);
}

export function squareSourceKind(token: unknown): PaymentSourceKind | null {
  if (typeof token !== "string") return null;
  if (token.startsWith("cnon:") || token.startsWith("ccof:")) return "CARD";
  if (token.startsWith("bauth:")) return "ACH";
  return null;
}

/** The client's declared method, narrowed to the two billing categories (null for anything else). */
export function declaredMethod(method: unknown): PaymentSourceKind | null {
  return method === "CARD" || method === "ACH" ? method : null;
}

/**
 * The category to bill: on Square the token decides and the declared word is
 * ignored; on any other processor (Finix tokens carry no type) the declared
 * word stands. Null = refuse the request.
 */
export function billingMethodFor(params: { processor: string; token: unknown; declared: unknown }): PaymentSourceKind | null {
  const declared = declaredMethod(params.declared);
  if (params.processor === "square") return squareSourceKind(params.token);
  return declared;
}
