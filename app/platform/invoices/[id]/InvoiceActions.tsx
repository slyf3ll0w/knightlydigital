"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  DollarSign,
  Loader2,
  Copy,
  MoreHorizontal,
  Eye,
  Pencil,
  RotateCcw,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";

export default function InvoiceActions({
  invoiceId,
  status,
  publicUrl,
  canDelete = false,
  paymentCount = 0,
  paymentTotal = 0,
  contactEmail = "",
}: {
  invoiceId: string;
  status: string;
  publicUrl: string;
  canDelete?: boolean;
  paymentCount?: number;
  paymentTotal?: number;
  contactEmail?: string;
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

  async function setStatus(newStatus: string) {
    setOpen(false);
    setBusy(true);
    try {
      await fetch(`/api/app/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
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

  // Email the client their pay link (DRAFT invoices move to Awaiting Payment)
  async function emailToClient() {
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

  function onDeleteClick() {
    setOpen(false);
    setDeleteError("");
    if (paymentCount === 0) {
      if (confirm("Permanently delete this invoice? This can't be undone.")) doDelete(false);
      return;
    }
    setConfirmText("");
    setDeleteOpen(true);
  }

  return (
    <div className="flex items-center gap-2 shrink-0" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {sentTo && (
        <span className="text-xs text-green-700 font-medium">Emailed to {sentTo}</span>
      )}

      {status === "DRAFT" &&
        (contactEmail ? (
          <button
            onClick={emailToClient}
            className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <Send size={13} />
            Email to Client
          </button>
        ) : (
          <button
            onClick={() => setStatus("AWAITING_PAYMENT")}
            title="No client email on file — this only marks the invoice as sent"
            className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <Send size={13} />
            Mark as Sent
          </button>
        ))}
      {(status === "AWAITING_PAYMENT" || status === "PAST_DUE") && (
        <button
          onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
          className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <DollarSign size={13} />
          Collect Payment
        </button>
      )}
      {status === "PAID" && (
        <button
          onClick={() => setStatus("AWAITING_PAYMENT")}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Re-open Invoice
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
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
              href={publicUrl}
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
            {canDelete && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={onDeleteClick}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete Invoice
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setDeleteOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
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
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            />

            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(true)}
                disabled={confirmText.trim().toUpperCase() !== "DELETE" || busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-40"
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
