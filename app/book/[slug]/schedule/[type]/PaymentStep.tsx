"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Lock } from "lucide-react";
import CardFields, { type CardFieldsHandle } from "@/components/CardFields";
import type { FinixConfig } from "@/lib/finix-js";

/**
 * Card entry for paid service bookings: the finix.js hosted fields the pay
 * page uses, mounted inside the booking stepper. The card is tokenized in
 * the customer's browser and charged only after the booking commits (see
 * lib/booking-checkout.ts); a decline releases the time.
 */
export type PaymentHandle = {
  tokenize: () => Promise<{ token: string; fraudSessionId: string | null } | null>;
};

const PaymentStep = forwardRef<
  PaymentHandle,
  {
    finix: FinixConfig;
    amount: number;
    mode: "NONE" | "DEPOSIT" | "FULL";
    depositAmount: number | null;
    surchargeRate: number | null;
    dark: boolean;
    accent: string;
    onReady: (ready: boolean) => void;
  }
>(function PaymentStep({ finix, amount, mode, depositAmount, surchargeRate, dark, accent, onReady }, ref) {
  const cardRef = useRef<CardFieldsHandle>(null);
  const [valid, setValid] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      tokenize: async () => {
        const token = await cardRef.current?.tokenize();
        return token ? { token, fraudSessionId: null } : null;
      },
    }),
    []
  );
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const due = mode === "FULL" ? amount : (depositAmount ?? 0);
  const fee = surchargeRate && surchargeRate > 0 ? Math.round(due * surchargeRate * 100) / 100 : 0;

  if (!finix) {
    return (
      <div className={`rounded border border-dashed px-4 py-3 text-sm ${dark ? "border-white/20 text-gray-400" : "border-gray-300 text-gray-500"}`}>
        Online payment isn&apos;t available right now — you can still book and pay after the visit.
      </div>
    );
  }
  return (
    <div className={`rounded border p-4 ${dark ? "border-white/15" : "border-gray-200"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={`text-sm font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
          {mode === "FULL" ? "Pay now" : "Deposit"} · ${due.toFixed(2)}
          {fee > 0 && <span className={`font-normal ${muted}`}> + ${fee.toFixed(2)} card fee</span>}
        </p>
        <span className={`inline-flex items-center gap-1 text-[11px] ${muted}`}>
          <Lock size={11} /> Secure
        </span>
      </div>
      <CardFields
        finix={finix}
        dark={dark}
        accent={accent}
        onValidity={(v) => {
          setValid(v);
          onReady(v);
        }}
      />
      <p className={`mt-2 text-[11px] ${muted}`}>
        {mode === "FULL"
          ? "Charged when you confirm. If the card is declined the time is released."
          : `The remaining balance is due after the visit. If the card is declined the time is released.`}
        {!valid ? "" : ""}
      </p>
    </div>
  );
});

export default PaymentStep;
