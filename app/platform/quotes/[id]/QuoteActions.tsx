"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MoreHorizontal,
  Send,
  CheckCircle,
  Briefcase,
  Eye,
  Archive,
  Trash2,
  Copy,
  Loader2,
  Pencil,
  RotateCcw,
  FileSignature,
  Clock,
  DollarSign,
} from "lucide-react";

type AgreementState = {
  signed: boolean;
  sent: boolean;
  templates: { id: string; name: string }[];
} | null;

export default function QuoteActions({
  quoteId,
  status,
  publicUrl,
  hasJob,
  wasSent = false,
  contactId = "",
  agreement = null,
  hasDeposit = false,
  depositInvoiced = false,
}: {
  quoteId: string;
  status: string;
  publicUrl: string;
  hasJob: boolean;
  wasSent?: boolean;
  contactId?: string;
  agreement?: AgreementState;
  hasDeposit?: boolean;
  depositInvoiced?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [templateId, setTemplateId] = useState(agreement?.templates[0]?.id ?? "");
  const [agreementError, setAgreementError] = useState("");
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
      await fetch(`/api/app/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function convertToJob() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/convert`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.id) {
        router.push(`/app/jobs/${data.id}`);
        return;
      }
      if (data?.error) alert(data.error);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendAgreement() {
    if (!templateId) return;
    setBusy(true);
    setAgreementError("");
    try {
      const res = await fetch("/api/app/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, templateId, quoteId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAgreementError(data?.error ?? "Couldn't send the agreement.");
        return;
      }
      setAgreementOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function collectDeposit() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/collect-deposit`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? "Couldn't create the deposit invoice.");
        return;
      }
      if (data?.invoiceId) {
        router.push(`/app/invoices/${data.invoiceId}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuote() {
    const warning =
      status === "CONVERTED"
        ? "Delete this quote? The job it was converted into stays. This cannot be undone."
        : "Delete this quote? This cannot be undone.";
    if (!confirm(warning)) return;
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/app/quotes");
        return;
      }
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Couldn't delete this quote.");
    } finally {
      setBusy(false);
    }
  }

  const editable = status === "DRAFT" || status === "AWAITING_RESPONSE";

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {/* Primary action follows the lifecycle (Jobber behavior) */}
      {status === "DRAFT" && (
        <button
          onClick={() => setStatus("AWAITING_RESPONSE")}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Send size={13} />
          Mark as Sent
        </button>
      )}
      {(status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
        <button
          onClick={() => setStatus("APPROVED")}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <CheckCircle size={13} />
          Mark Approved
        </button>
      )}
      {/* Approved quotes convert — unless an agreement-requiring service is
          waiting on a signature (price-book flag) */}
      {status === "APPROVED" && !hasJob && agreement && !agreement.signed ? (
        agreement.sent ? (
          <span className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium rounded">
            <Clock size={13} />
            Awaiting agreement signature
          </span>
        ) : (
          <button
            onClick={() => setAgreementOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <FileSignature size={13} />
            Send Agreement
          </button>
        )
      ) : (
        status === "APPROVED" &&
        !hasJob && (
          <button
            onClick={convertToJob}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <Briefcase size={13} />
            Convert to Job
          </button>
        )
      )}
      {/* Archived quotes reopen where they left off: sent ones go back to
          Awaiting Response, never-sent ones to Draft */}
      {status === "ARCHIVED" && (
        <button
          onClick={() => setStatus(wasSent ? "AWAITING_RESPONSE" : "DRAFT")}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Reopen Quote
        </button>
      )}

      {editable && (
        <Link
          href={`/app/quotes/${quoteId}/edit`}
          className="p-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          title="Edit quote"
        >
          <Pencil size={15} />
        </Link>
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
              {copied ? "Copied!" : "Copy client link"}
            </button>
            <div className="my-1 border-t border-gray-100" />
            {status !== "APPROVED" && status !== "CONVERTED" && (
              <button
                onClick={() => setStatus("APPROVED")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CheckCircle size={14} className="text-gray-400" />
                Mark as... Approved
              </button>
            )}
            {status === "APPROVED" && !hasJob && (
              <button
                onClick={convertToJob}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Briefcase size={14} className="text-gray-400" />
                Convert to Job
              </button>
            )}
            {hasDeposit && status !== "ARCHIVED" && (
              <button
                onClick={collectDeposit}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <DollarSign size={14} className="text-gray-400" />
                {depositInvoiced ? "Resend deposit invoice" : "Collect deposit"}
              </button>
            )}
            {agreement && !agreement.signed && status !== "ARCHIVED" && status !== "CONVERTED" && (
              <button
                onClick={() => {
                  setOpen(false);
                  setAgreementOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FileSignature size={14} className="text-gray-400" />
                {agreement.sent ? "Send agreement again" : "Send agreement"}
              </button>
            )}
            {status !== "ARCHIVED" && status !== "CONVERTED" && (
              <button
                onClick={() => setStatus("ARCHIVED")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            )}
            {editable && (
              <Link
                href={`/app/quotes/${quoteId}/edit`}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={14} className="text-gray-400" />
                Edit Quote
              </Link>
            )}
            <button
              onClick={deleteQuote}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Send-agreement modal: pick a template, signing link goes to the
          client's inbox; the quote unlocks once they sign */}
      {agreementOpen && agreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !busy && setAgreementOpen(false)}
          />
          <div className="relative w-full max-w-md card-ledger bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Send agreement</h2>
            <p className="text-sm text-gray-600 mb-4">
              This quote includes services that require a signed agreement before work starts.
              The signing link is emailed to your client; the quote unlocks when they sign.
            </p>
            {agreement.templates.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
                No agreement templates yet — create one under Settings → Contract Templates
                first.
              </p>
            ) : (
              <>
                <label className="block text-xs text-gray-500 mb-1">Agreement template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
                >
                  {agreement.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {agreementError && <p className="text-xs text-red-600 mb-3">{agreementError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAgreementOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              {agreement.templates.length > 0 && (
                <button
                  onClick={sendAgreement}
                  disabled={busy || !templateId}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />}
                  Send Agreement
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
