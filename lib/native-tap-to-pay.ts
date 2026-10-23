"use client";

import { getCapacitor, nativePlatform } from "@/components/NativeShell";

/**
 * The phone app's Tap to Pay engine — Square's Mobile Payments SDK wrapped
 * by ios/App/App/TapToPayPlugin.swift and
 * android/app/src/main/java/com/streamflaire/hub/TapToPayPlugin.java —
 * reached through window.Capacitor.Plugins like every shell integration.
 * Nothing here imports @capacitor/*, so the web bundle is untouched and a
 * shell built before the plugin existed simply has no bridge (the page
 * then shows no Tap to Pay button at all).
 *
 * The flow a page runs (components/TapToPayButton.tsx):
 *   status()  → authorized? capable? Apple ID linked (iOS)?
 *   authorize({ accessToken, locationId, environment })  with a token from
 *             GET /api/app/square/mobile-token (the seller's own OAuth
 *             token — Square's design; never stored by the page)
 *   linkAppleAccount()  once per phone on iOS (Apple's terms sheet)
 *   pay({...})  → Square's own prompt UI → { paymentId } on success, or a
 *             rejection whose `code` lib/tap-to-pay-shared.ts can word
 *   POST /api/app/invoices/[id]/tap-payment { paymentId }  records it after
 *             the server re-reads the payment from Square.
 */

export type TapToPayStatus = {
  platform: "ios" | "android";
  /** The SDK was initialized with an application id (Info.plist / strings.xml). */
  configured: boolean;
  /** This phone can take contactless payments (iPhone XS+ / supported Android). */
  capable: boolean;
  authorized: boolean;
  /** The location the SDK is authorized for (null when not authorized). */
  locationId: string | null;
  /** iOS only: the seller's Apple ID is linked for Tap to Pay. Android: null. */
  appleLinked: boolean | null;
  environment: "sandbox" | "production" | null;
};

export type TapToPayPaid = {
  paymentId: string;
  status: string;
  cardBrand?: string | null;
  last4?: string | null;
};

export type TapToPayPlugin = {
  status(): Promise<TapToPayStatus>;
  /** Asks for the OS permissions the SDK needs (location; Bluetooth on iOS). */
  requestPermissions(): Promise<{ location: boolean }>;
  authorize(o: { accessToken: string; locationId: string; environment: "sandbox" | "production" }): Promise<{ ok: boolean }>;
  deauthorize(): Promise<void>;
  /** iOS only — shows Apple's Tap to Pay terms sheet; resolves once linked. */
  linkAppleAccount(): Promise<{ linked: boolean }>;
  pay(o: {
    amountCents: number;
    currency: string;
    /** Our invoice id; lands on the Square payment as reference_id. */
    referenceId: string;
    /** What the seller sees in their Square dashboard. */
    note: string;
    /** UUID — Square's idempotency key for this attempt. */
    paymentAttemptId: string;
  }): Promise<TapToPayPaid>;
};

export function nativeTapToPay(): TapToPayPlugin | null {
  if (!nativePlatform()) return null;
  const p = getCapacitor()?.Plugins?.WorkBenchTapToPay as TapToPayPlugin | undefined;
  return typeof p?.pay === "function" && typeof p?.status === "function" ? p : null;
}

/** A thrown plugin rejection → its code (Capacitor passes `code` through) and message. */
export function tapToPayError(err: unknown): { code: string | null; message: string } {
  const e = err as { code?: unknown; message?: unknown; errorMessage?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : null;
  const message =
    typeof e?.message === "string" ? e.message : typeof e?.errorMessage === "string" ? e.errorMessage : "";
  return { code, message };
}

export function newPaymentAttemptId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
  }
}
