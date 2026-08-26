"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import Modal from "@/components/Modal";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { hapticNotify } from "@/lib/haptics";

/**
 * Refund a processor payment (full or partial) — the one dialog behind every
 * refund button (invoice payment rows, the Payments dashboard). Rides the
 * Modal primitive (bottom sheet on phones, centered card on desktop) in
 * portal mode: it lives inside row <Link>s, so clicks must not bubble into
 * navigation.
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      portal
      cardClassName="w-full max-w-sm overflow-hidden rounded-[14px] bg-white p-0 shadow-2xl"
    >
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
    </Modal>
  );
}
