"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { hapticNotify } from "@/lib/haptics";

/**
 * Refund a processor payment (full or partial) — the one dialog behind every
 * refund button (invoice payment rows, the Payments dashboard). Bottom sheet
 * on phones, centered card on desktop; no hover needed anywhere, so it works
 * the same in the iOS shell as at a desk.
 *
 * Rendered through a portal so it can live inside row <Link>s without clicks
 * bubbling into navigation (portal events still bubble through the REACT
 * tree, hence the stopPropagation/preventDefault at the root).
 */
export default function RefundDialog({
  paymentId,
  maxAmount,
  open,
  onClose,
}: {
  paymentId: string;
  /** What's still refundable — the payment's current amount. */
  maxAmount: number;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(maxAmount.toFixed(2));
      setError("");
      hapticNotify("WARNING");
    }
  }, [open, maxAmount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const parsed = Math.round(parseFloat(amount || "0") * 100) / 100;
  const valid = parsed > 0 && parsed <= maxAmount + 0.005;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/payments/${paymentId}/refund`, {
      amount: parsed,
    });
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onClose();
    router.refresh();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        // Inside a row <Link>, any click here would otherwise navigate
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        style={{ touchAction: "none" }}
        onClick={busy ? undefined : onClose}
      />
      <div className="absolute inset-x-0 bottom-0 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-[30%] lg:w-[380px] lg:-translate-x-1/2 lg:px-0 lg:pb-0">
        <div className="overflow-hidden rounded-[14px] bg-white shadow-2xl">
          <div className="px-5 pb-4 pt-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
              <Undo2 size={15} className="text-amber-600" />
              Refund this payment
            </p>
            <p className="mt-1 text-[13px] leading-snug text-gray-500">
              The money goes back to the client&apos;s card or bank — up to{" "}
              {money(maxAmount)}.
            </p>
            <label className="mt-3 block text-xs text-gray-500">
              Refund amount
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  max={maxAmount}
                  value={amount}
                  autoFocus
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </label>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || !valid}
              className="btn-tool flex items-center gap-1.5 rounded-[10px] bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
              {valid ? `Refund ${money(parsed)}` : "Refund"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
