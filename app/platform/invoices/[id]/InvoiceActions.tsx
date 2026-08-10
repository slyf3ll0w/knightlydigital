"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  DollarSign,
  Loader2,
  Copy,
  CopyPlus,
  MoreHorizontal,
  Eye,
  Pencil,
  RotateCcw,
  Trash2,
  AlertTriangle,
  FileDown,
  Archive,
  X,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { confirmSheet } from "@/components/ConfirmSheet";
import { launchSendPlane, launchPointFrom } from "@/lib/send-plane";
import { hapticImpact } from "@/lib/haptics";

export default function InvoiceActions({
  invoiceId,
  status,
  publicUrl,
  canDelete = false,
  paymentCount = 0,
  paymentTotal = 0,
  contactEmail = "",
  chargeStoredLabel = null,
  balance = 0,
  reopenStatus = "DRAFT",
}: {
  invoiceId: string;
  status: string;
  publicUrl: string;
  canDelete?: boolean;
  paymentCount?: number;
  paymentTotal?: number;
  contactEmail?: string;
  /** Saved-card label when this invoice can be charged to the card on file. */
  chargeStoredLabel?: string | null;
  balance?: number;
  /** Where "Reopen" lands an archived invoice (computed from its payments). */
  reopenStatus?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Sent confirmation auto-dismisses — on mobile it floats as a pill above
  // the tab bar instead of crowding the action row
  useEffect(() => {
    if (!sentTo) return;
    const t = setTimeout(() => setSentTo(""), 6000);
    return () => clearTimeout(t);
  }, [sentTo]);

  async function setStatus(newStatus: string) {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "Couldn't update the invoice.");
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Duplicate into a fresh draft and jump straight to it
  async function duplicateInvoice() {
    setOpen(false);
    const res = await fetch(`/api/app/invoices/${invoiceId}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) {
      alert(data?.error ?? "Couldn't duplicate the invoice.");
      return;
    }
    router.push(`/app/invoices/${data.id}`);
  }

  // Archive shelves the invoice without touching its payments — the
  // paper-trail-preserving alternative to Delete.
  async function archive() {
    setOpen(false);
    const ok = await confirmSheet({
      title: "Archive this invoice?",
      message:
        "It moves out of your invoice list and stops payment reminders. Payments already recorded stay. You can reopen it anytime.",
      confirmLabel: "Archive Invoice",
    });
    if (ok) await setStatus("ARCHIVED");
  }

  // Charge the remaining balance to the client's card on file
  async function chargeStored() {
    setOpen(false);
    const ok = await confirmSheet({
      title: "Charge card on file?",
      message: `${money(balance)} will be charged to ${chargeStoredLabel} right now. No card surcharge is applied to stored charges.`,
      confirmLabel: `Charge ${money(balance)}`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/app/invoices/${invoiceId}/charge-stored`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? GENERIC_ERROR);
      } else {
        hapticImpact();
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  // Email the client their pay link (DRAFT invoices move to Awaiting Payment)
  async function emailToClient(e?: React.MouseEvent<HTMLElement>) {
    // Launch point grabbed now — the button unmounts before the send resolves
    const from = launchPointFrom(e?.currentTarget ?? null);
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/invoices/${invoiceId}/send`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? "Couldn't send the invoice.");
        return;
      }
      setSentTo(data?.to ?? contactEmail);
      hapticImpact("LIGHT");
      launchSendPlane(from);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function doDelete(force: boolean) {
    setBusy(true);
    setDeleteError("");
    const { ok, data } = await postJson(
      `/api/app/invoices/${invoiceId}${force ? "?force=1" : ""}`,
      undefined,
      "DELETE"
    );
    setBusy(false);
    if (!ok) {
      setDeleteError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/invoices");
    router.refresh();
  }

  async function onDeleteClick() {
    setOpen(false);
    setDeleteError("");
    if (paymentCount === 0) {
      if (
        await confirmSheet({
          title: "Permanently delete this invoice?",
          message: "This can't be undone.",
          confirmLabel: "Delete Invoice",
          destructive: true,
        })
      )
        doDelete(false);
      return;
    }
    setConfirmText("");
    setDeleteOpen(true);
  }

  return (
    <div className="flex items-center gap-2 shrink-0" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {sentTo && (
        <span className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 max-w-[calc(100vw-2rem)] truncate rounded-full bg-gray-900/95 px-4 py-2 text-xs font-medium text-white shadow-lg lg:static lg:left-auto lg:bottom-auto lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-none lg:bg-transparent lg:p-0 lg:text-green-700 lg:shadow-none">
          Emailed to {sentTo}
        </span>
      )}

      {status === "DRAFT" &&
        (contactEmail ? (
          <button
            onClick={emailToClient}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Send size={13} />
            Email to Client
          </button>
        ) : (
          <button
            onClick={() => setStatus("AWAITING_PAYMENT")}
            title="No client email on file — this only marks the invoice as sent"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Send size={13} />
            Mark as Sent
          </button>
        ))}
      {(status === "AWAITING_PAYMENT" || status === "PAST_DUE") && (
        <button
          onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <DollarSign size={13} />
          Collect Payment
        </button>
      )}
      {status === "PAID" && (
        <button
          onClick={() => setStatus("AWAITING_PAYMENT")}
          className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Re-open Invoice
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className="sheet-material absolute right-0 top-full mt-1 z-30 w-max min-w-[13rem] whitespace-nowrap rounded-lg shadow-xl border border-gray-200 py-1.5">
            {status !== "PAID" && (
              <button
                onClick={() => router.push(`/app/invoices/${invoiceId}/edit`)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={14} className="text-gray-400" />
                Edit Invoice
              </button>
            )}
            <a
              href={`${publicUrl}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Eye size={14} className="text-gray-400" />
              Preview as Client
            </a>
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Copy size={14} className="text-gray-400" />
              {copied ? "Copied!" : "Copy payment link"}
            </button>
            <a
              href={`/api/app/invoices/${invoiceId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileDown size={14} className="text-gray-400" />
              Download PDF
            </a>
            {chargeStoredLabel && balance > 0 && (
              <button
                onClick={chargeStored}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <DollarSign size={14} className="text-gray-400" />
                <span className="truncate">Charge card on file ({chargeStoredLabel})</span>
              </button>
            )}
            <button
              onClick={duplicateInvoice}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <CopyPlus size={14} className="text-gray-400" />
              Duplicate Invoice
            </button>
            {contactEmail && status === "DRAFT" && (
              <button
                onClick={() => setStatus("AWAITING_PAYMENT")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Send size={14} className="text-gray-400" />
                Mark as Sent (no email)
              </button>
            )}
            {contactEmail && (status === "AWAITING_PAYMENT" || status === "PAST_DUE") && (
              <button
                onClick={emailToClient}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Send size={14} className="text-gray-400" />
                Email to client again
              </button>
            )}
            {status !== "PAID" && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <DollarSign size={14} className="text-gray-400" />
                  Collect Payment
                </button>
              </>
            )}
            <div className="my-1 border-t border-gray-100" />
            {status === "ARCHIVED" ? (
              <button
                onClick={() => setStatus(reopenStatus)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw size={14} className="text-gray-400" />
                Reopen Invoice
              </button>
            ) : (
              <button
                onClick={archive}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDeleteClick}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete Invoice
              </button>
            )}
          </div>
        )}
      </div>

      {deleteOpen && (
        <div className="modal-pop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setDeleteOpen(false)} />
          <div className="modal-card relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={17} className="text-red-600" />
              </span>
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete this invoice?</h2>
            <p className="text-sm text-gray-600 mb-3">
              It has{" "}
              <span className="font-semibold text-gray-900">
                {paymentCount} recorded {paymentCount === 1 ? "payment" : "payments"} totaling{" "}
                {money(paymentTotal)}
              </span>
              {" "}— those records are deleted with it, and your revenue history changes. There is
              no undo.
            </p>

            <label className="block text-xs text-gray-500 mb-1">
              Type <span className="font-semibold text-gray-700">DELETE</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            />

            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(true)}
                disabled={confirmText.trim().toUpperCase() !== "DELETE" || busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
