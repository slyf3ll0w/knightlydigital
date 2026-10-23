/**
 * Tap to Pay — client-safe shapes shared by the page, the native bridge
 * (lib/native-tap-to-pay.ts) and the server (lib/tap-to-pay.ts).
 * Plan: docs/plans/checkout-tap-to-pay-2026-10-22.md § 2.
 */

/** What a page needs to offer Tap to Pay on this device, or null = don't. */
export type TapToPayOffer = {
  /** Square environment the seller's token belongs to; the SDK must match. */
  environment: "sandbox" | "production";
  /** The seller's charge location (the SDK authorizes against one location). */
  locationId: string;
  /** Card surcharge the company adds (fraction, 0 when off) — applied in person too (decision 3). */
  surchargeRate: number;
  /** The seller's Square grant predates the in-person scope: Settings must reconnect first. */
  needsReconnect: boolean;
  /** Owners/admins may run setup (Apple ID linking, reconnect); others only pay. */
  canSetUp: boolean;
} | null;

/** The in-person scope the Mobile Payments SDK requires on the seller's token. */
export const SQUARE_IN_PERSON_SCOPE = "PAYMENTS_WRITE_IN_PERSON";

export function hasInPersonScope(scopes: string | null | undefined): boolean {
  return (scopes ?? "").split(/\s+/).includes(SQUARE_IN_PERSON_SCOPE);
}

/** Plain-language failure lines for the overlay (the SDK's codes are terse). */
export function tapToPayFailureText(code: string | null | undefined, fallback?: string): string {
  switch ((code ?? "").toUpperCase()) {
    case "CANCELED":
    case "CANCELLED":
      return "Cancelled — nothing was charged.";
    case "DECLINED":
    case "CARD_DECLINED":
      return "The card was declined.";
    case "NOT_AUTHORIZED":
    case "UNAUTHORIZED":
      return "Square needs to be set up on this phone first — open Settings → Online Payments.";
    case "NOT_CAPABLE":
    case "DEVICE_NOT_SUPPORTED":
      return "This phone can't take Tap to Pay (needs iPhone XS or newer, or a recent Android phone).";
    case "APPLE_NOT_LINKED":
      return "Tap to Pay needs the Apple ID step in Settings → Online Payments first.";
    case "NO_NETWORK":
    case "OFFLINE":
      return "Tap to Pay needs an internet connection.";
    case "LOCATION_DENIED":
    case "LOCATION_PERMISSION":
      return "Square requires location access for in-person payments — allow it in your phone's settings.";
    case "SDK_NOT_CONFIGURED":
      return "Tap to Pay isn't set up in this version of the app yet.";
    default:
      return fallback || "Tap to Pay didn't go through. Try again, or take the card another way.";
  }
}
