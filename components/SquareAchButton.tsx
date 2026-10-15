"use client";

import { useEffect, useRef, useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import type { SquareClientConfig } from "@/lib/pay-config";
import { loadSquareJs, squareTokenError, type SquareAchInstance, type SquarePaymentsInstance } from "@/lib/square-js";

/**
 * Pay by bank through Square: the Web Payments SDK's ACH method opens Plaid
 * Link in a popup, the client picks their bank and account, and we get a
 * one-time `bauth:…` token to charge exactly like a card token. The ACH
 * debit then stays PENDING for a few business days (webhook settles or
 * returns it). Square requires the account holder's name and the exact
 * amount at tokenize time, so both are inputs here.
 */
export default function SquareAchButton({
  config,
  amount,
  defaultName,
  accent,
  textColor,
  disabled,
  onToken,
  onError,
}: {
  config: SquareClientConfig;
  /** Dollars — what will be debited. */
  amount: number;
  defaultName?: string;
  accent: string;
  textColor: string;
  disabled?: boolean;
  onToken: (token: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const achRef = useRef<SquareAchInstance | null>(null);
  const paymentsRef = useRef<SquarePaymentsInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSquareJs(config.environment);
        if (cancelled || !window.Square) return;
        const payments = paymentsRef.current ?? window.Square.payments(config.applicationId, config.locationId);
        paymentsRef.current = payments;
        // redirectURI/transactionId back the mobile-web fallback where Plaid
        // can't open a popup; we return to the same page.
        const ach = await payments.ach({
          redirectURI: typeof window !== "undefined" ? window.location.href.split("#")[0] : undefined,
          transactionId: `wb-${Date.now()}`,
        });
        if (cancelled) {
          await ach.destroy().catch(() => {});
          return;
        }
        achRef.current = ach;
        setReady(true);
      } catch (err) {
        console.error("[square] ach failed to initialise", err);
        onError("Bank payments couldn't load. Please pay by card or try again later.");
      }
    })();
    return () => {
      cancelled = true;
      const a = achRef.current;
      achRef.current = null;
      if (a) a.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.applicationId, config.locationId, config.environment]);

  async function pay() {
    const ach = achRef.current;
    if (!ach) return;
    if (!name.trim()) {
      onError("Enter the name on the bank account.");
      return;
    }
    setBusy(true);
    try {
      const result = await ach.tokenize({
        accountHolderName: name.trim(),
        intent: "CHARGE",
        amount: Math.round(amount * 100) / 100,
        currency: "USD",
      });
      if (result.status === "OK" && result.token) {
        await onToken(result.token);
      } else if (result.status !== "Cancel") {
        onError(squareTokenError(result));
      }
    } catch (err) {
      console.error("[square] ach tokenize failed", err);
      onError("The bank connection didn't go through. Please try again or pay by card.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Name on the bank account</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2"
        style={{ ["--tw-ring-color" as string]: `${accent}40` }}
        placeholder="Full name"
      />
      <button
        type="button"
        onClick={pay}
        disabled={disabled || busy || !ready}
        className="w-full py-3 font-semibold text-sm rounded transition-opacity hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ backgroundColor: accent, color: textColor }}
      >
        {busy || !ready ? <Loader2 size={14} className="animate-spin" /> : <Landmark size={14} />}
        Connect bank &amp; pay ${amount.toFixed(2)}
      </button>
      <p className="mt-2 text-[11px] text-gray-400">
        Your bank login happens in a secure window run by Plaid. Bank payments take a few business days to clear.
      </p>
    </div>
  );
}
