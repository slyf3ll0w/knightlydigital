"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, Undo2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { paymentMethodLabel, money } from "@/lib/statuses";
import { confirmSheet } from "@/components/ConfirmSheet";
import RefundDialog from "@/components/RefundDialog";

const METHODS = [
  "CASH", "CHECK", "CARD", "ACH", "CASH_APP", "PAYPAL", "VENMO", "ZELLE", "OTHER",
] as const;

/**
 * One payment on the invoice, with inline correction (amount, method, date,
 * reference) and delete (managers). The API recomputes the invoice's
 * PAID/AWAITING_PAYMENT/PAST_DUE status after every change.
 */
export default function PaymentRow({
  payment,
  canDelete,
  canRefund = false,
  isOnline = false,
}: {
  payment: {
    id: string;
    amount: number;
    method: string;
    paidAtDate: string; // yyyy-mm-dd for the date input
    paidAtLabel: string;
    referenceNumber: string;
    details: string;
  };
  canDelete: boolean;
  /** Online (processor) payments only — sends money back via the processor. */
  canRefund?: boolean;
  /**
   * Charged through the processor. Amount, method and date are whatever
   * actually settled, so the API won't let them be edited (and won't let the
   * record be deleted) — only the reference/notes are the shop's to change.
   */
  isOnline?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    amount: String(payment.amount),
    method: payment.method,
    paidAt: payment.paidAtDate,
    referenceNumber: payment.referenceNumber,
    details: payment.details,
  });

  function openEdit() {
    setForm({
      amount: String(payment.amount),
      method: payment.method,
      paidAt: payment.paidAtDate,
      referenceNumber: payment.referenceNumber,
      details: payment.details,
    });
    setError("");
    setEditing(true);
  }

  async function save() {
    const amount = parseFloat(form.amount);
    if (!isOnline && (!amount || amount <= 0)) {
      setError("Amount must be greater than zero.");
      return;
    }
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/payments/${payment.id}`,
      {
        // Sending amount/method/paidAt on a processor charge is rejected by
        // the API — only the reference and notes are editable there.
        ...(isOnline
          ? {}
          : { amount, method: form.method, paidAt: form.paidAt || undefined }),
        referenceNumber: form.referenceNumber,
        details: form.details,
      },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: `Delete this ${money(payment.amount)} payment record?`,
        message: "The invoice balance and status update to match. This can't be undone.",
        confirmLabel: "Delete Payment",
        destructive: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/payments/${payment.id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <div className="px-5 py-3 bg-gray-50/70">
        {isOnline && (
          <p className="mb-2 text-xs text-gray-500">
            {money(payment.amount)} · {paymentMethodLabel[payment.method] ?? payment.method} ·{" "}
            {payment.paidAtLabel} — locked to what settled online.
            {canRefund && payment.amount > 0 && " Refund to send money back."}
          </p>
        )}
        <div className={`grid gap-2 mb-2 ${isOnline ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>
          {!isOnline && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Amount</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Method</label>
                <select
                  value={form.method}
                  onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {paymentMethodLabel[m] ?? m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Date</label>
                <input
                  type="date"
                  value={form.paidAt}
                  onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Reference #</label>
            <input
              type="text"
              value={form.referenceNumber}
              onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
              placeholder="Check #, confirmation..."
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex items-center gap-1.5">
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-40"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-full"
          >
            <X size={11} />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3 text-sm group">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{paymentMethodLabel[payment.method] ?? payment.method}</p>
        <p className="text-xs text-gray-500">
          {payment.paidAtLabel}
          {payment.referenceNumber && ` · Ref: ${payment.referenceNumber}`}
          {payment.details && ` · ${payment.details}`}
        </p>
        {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
      </div>
      {/* Hover-revealed at a desk, always visible on touch — phones have no
          hover, so hiding these made refund/edit/delete unreachable there. */}
      <span className="flex items-center gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
        {canRefund && payment.amount > 0 && (
          <button
            onClick={() => setRefunding(true)}
            disabled={busy}
            title="Refund payment"
            className="p-1.5 text-gray-400 hover:text-amber-600 rounded-full"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
          </button>
        )}
        <button
          onClick={openEdit}
          title="Edit payment"
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
        >
          <Pencil size={13} />
        </button>
        {canDelete && (
          <button
            onClick={remove}
            disabled={busy}
            title="Delete payment"
            className="p-1.5 text-gray-400 hover:text-red-600 rounded-full"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
      </span>
      <span className="font-semibold text-gray-900">{money(payment.amount)}</span>
      <RefundDialog
        paymentId={payment.id}
        maxAmount={payment.amount}
        open={refunding}
        onClose={() => setRefunding(false)}
      />
    </div>
  );
}
