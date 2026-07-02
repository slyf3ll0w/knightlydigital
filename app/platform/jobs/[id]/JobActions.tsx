"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, CheckCircle, Receipt, Archive, RotateCcw, Trash2, Loader2, Pencil } from "lucide-react";

export default function JobActions({
  jobId,
  status,
  hasInvoice,
  hasQuote = false,
  canDelete = false,
  canEdit = false,
}: {
  jobId: string;
  status: string;
  hasInvoice: boolean;
  hasQuote?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
      await fetch(`/api/app/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  // Closing the job: with an invoice it archives; without one it moves to
  // Requires Invoicing so billing isn't forgotten (Jobber behavior).
  async function closeJob() {
    if (hasInvoice) {
      await setStatus("ARCHIVED");
    } else {
      await setStatus("REQUIRES_INVOICING");
    }
  }

  async function deleteJob() {
    const warning = [
      "Permanently delete this job? Its notes, photos, and line items are deleted with it.",
      hasInvoice && "The invoice created from it stays, but loses its job link.",
      hasQuote && "The quote it came from reopens as Approved.",
      "This cannot be undone.",
    ]
      .filter(Boolean)
      .join(" ");
    if (!confirm(warning)) return;
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/jobs");
        return;
      }
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Couldn't delete this job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {status === "ACTIVE" && (
        <button
          onClick={closeJob}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <CheckCircle size={13} />
          Complete Job
        </button>
      )}
      {status === "REQUIRES_INVOICING" && (
        <button
          onClick={() => router.push(`/app/invoices/new?jobId=${jobId}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Receipt size={13} />
          Create Invoice
        </button>
      )}
      {status === "ARCHIVED" && (
        <button
          onClick={() => setStatus("ACTIVE")}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Reopen Job
        </button>
      )}

      {(status !== "ARCHIVED" || canDelete) && (
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
              {canEdit && status !== "ARCHIVED" && (
                <button
                  onClick={() => router.push(`/app/jobs/${jobId}/edit`)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil size={14} className="text-gray-400" />
                  Edit Job
                </button>
              )}
              {status !== "ARCHIVED" && !hasInvoice && (
                <button
                  onClick={() => router.push(`/app/invoices/new?jobId=${jobId}`)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Receipt size={14} className="text-gray-400" />
                  Create Invoice
                </button>
              )}
              {status !== "ARCHIVED" && (
                <button
                  onClick={() => setStatus("ARCHIVED")}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Archive size={14} className="text-gray-400" />
                  Close Job{!hasInvoice ? " without invoicing" : ""}
                </button>
              )}
              {canDelete && (
                <>
                  {status !== "ARCHIVED" && <div className="my-1 border-t border-gray-100" />}
                  <button
                    onClick={deleteJob}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    Delete Job
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
