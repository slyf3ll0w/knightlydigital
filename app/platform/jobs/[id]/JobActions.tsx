"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, CheckCircle, Receipt, Archive, RotateCcw, Trash2, Loader2, Pencil, CopyPlus } from "lucide-react";
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";
import { sendOrQueue } from "@/lib/outbox";

export default function JobActions({
  jobId,
  status,
  hasInvoice,
  hasQuote = false,
  canDelete = false,
  canEdit = false,
  scheduledAt = null,
}: {
  jobId: string;
  status: string;
  hasInvoice: boolean;
  hasQuote?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  scheduledAt?: string | null;
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
      // Offline, the change queues and applies on reconnect. Checklist ticks
      // made offline queue ahead of this, so the close-out gate still holds.
      const res = await sendOrQueue({
        url: `/api/app/jobs/${jobId}/status`,
        method: "PATCH",
        body: { status: newStatus },
        label:
          newStatus === "ARCHIVED"
            ? "Close job"
            : newStatus === "REQUIRES_INVOICING"
              ? "Complete job"
              : "Reopen job",
      });
      if (res.queued) {
        alertSheet({ message: "You're offline — this change is saved and will apply when you reconnect." });
        return;
      }
      // The close-out checklist gate (and other validation) answers 400
      if (!res.ok && res.data?.error) alertSheet({ message: res.data.error });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  // Closing the job: with an invoice it archives; without one it moves to
  // Requires Invoicing so billing isn't forgotten (Jobber behavior).
  async function closeJob() {
    // One click is right for the driveway case — but completing a job whose
    // visit hasn't happened yet is usually a misclick, so double-check.
    if (scheduledAt && new Date(scheduledAt).getTime() > Date.now()) {
      const when = new Date(scheduledAt).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      if (
        !(await confirmSheet({
          message: `This job is scheduled for ${when} — complete it anyway?`,
          confirmLabel: "Complete Anyway",
        }))
      )
        return;
    }
    if (hasInvoice) {
      await setStatus("ARCHIVED");
    } else {
      await setStatus("REQUIRES_INVOICING");
    }
  }

  // Duplicate into a fresh unscheduled job and jump to it
  async function duplicateJob() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/jobs/${jobId}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        alertSheet({ message: data?.error ?? "Couldn't duplicate the job." });
        return;
      }
      router.push(`/app/jobs/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob() {
    const warning = [
      "Its notes, photos, and line items are deleted with it.",
      hasInvoice && "The invoice created from it stays, but loses its job link.",
      hasQuote && "The quote it came from reopens as Approved.",
      "This cannot be undone.",
    ]
      .filter(Boolean)
      .join(" ");
    if (
      !(await confirmSheet({
        title: "Permanently delete this job?",
        message: warning,
        confirmLabel: "Delete Job",
        destructive: true,
      }))
    )
      return;
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/jobs");
        return;
      }
      const data = await res.json().catch(() => null);
      alertSheet({ message: data?.error ?? "Couldn't delete this job." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {/* Primary action — a docked pill above the tab bar on phones (always
          at the thumb, survives scrolling the checklist/notes), a normal
          header button on desktop. Right-aligned so it clears the center FAB. */}
      {status === "ACTIVE" && (
        <button
          onClick={closeJob}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors max-lg:fixed max-lg:right-4 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:rounded-full max-lg:px-5 max-lg:py-3 max-lg:text-[15px]"
        >
          <CheckCircle size={13} />
          Complete Job
        </button>
      )}
      {status === "REQUIRES_INVOICING" && (
        <button
          onClick={() => router.push(`/app/invoices/new?jobId=${jobId}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors max-lg:fixed max-lg:right-4 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:rounded-full max-lg:px-5 max-lg:py-3 max-lg:text-[15px]"
        >
          <Receipt size={13} />
          Create Invoice
        </button>
      )}
      {status === "ARCHIVED" && (
        <button
          onClick={() => setStatus("ACTIVE")}
          className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Reopen Job
        </button>
      )}

      {(status !== "ARCHIVED" || canDelete) && (
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {open && (
            <div className="sheet-material absolute right-0 top-full mt-1 z-30 w-max min-w-[13rem] whitespace-nowrap rounded-lg shadow-xl border border-gray-200 py-1.5">
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
              {canEdit && (
                <button
                  onClick={duplicateJob}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <CopyPlus size={14} className="text-gray-400" />
                  Duplicate Job
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
