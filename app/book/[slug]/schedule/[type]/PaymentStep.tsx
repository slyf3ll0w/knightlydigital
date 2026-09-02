"use client";

import { forwardRef, useImperativeHandle } from "react";

/**
 * Card entry for paid service bookings. Phase C mounts finix.js hosted
 * fields here (the same tokenizer the pay page uses); until then the step
 * renders a note and never reports ready, so the submit button stays off.
 */
export type PaymentHandle = {
  tokenize: () => Promise<{ token: string; fraudSessionId: string | null } | null>;
};

const PaymentStep = forwardRef<
  PaymentHandle,
  {
    companySlug: string;
    typeSlug: string;
    amount: number;
    mode: "NONE" | "DEPOSIT" | "FULL";
    dark: boolean;
    accent: string;
    onReady: (ready: boolean) => void;
  }
>(function PaymentStep({ dark }, ref) {
  useImperativeHandle(ref, () => ({ tokenize: async () => null }), []);
  return (
    <div className={`rounded border border-dashed px-4 py-3 text-sm ${dark ? "border-white/20 text-gray-400" : "border-gray-300 text-gray-500"}`}>
      Online payment for this booking isn&apos;t available yet.
    </div>
  );
});

export default PaymentStep;
