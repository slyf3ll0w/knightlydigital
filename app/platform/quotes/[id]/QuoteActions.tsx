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
  CopyPlus,
  Loader2,
  Pencil,
  RotateCcw,
  FileSignature,
  FileDown,
  Clock,
  DollarSign,
} from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { hapticImpact } from "@/lib/haptics";
import SendOverlay from "@/components/SendOverlay";

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
  contactEmail = "",
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
  contactEmail?: string;
  agreement?: AgreementState;
  hasDeposit?: boolean;
  depositInvoiced?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [sendShow, setSendShow] = useState<string | null>(null);
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

  // Email the client their approval link (marks the quote sent on success)
  async function emailToClient() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/send`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? "Couldn't send the quote.");
        return;
      }
      setSentTo(data?.to ?? contactEmail);
      hapticImpact("LIGHT");
      setSendShow(data?.to ?? contactEmail);
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
        ? "The job it was converted into stays. This cannot be undone."
        : "This cannot be undone.";
    if (
      !(await confirmSheet({
        title: "Delete this quote?",
        message: warning,
        confirmLabel: "Delete Quote",
        destructive: true,
      }))
    )
      return;
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

  const editable =
    status === "DRAFT" || status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED";

  // Duplicate into a fresh draft and jump straight to it
  async function duplicateQuote() {
    setOpen(false);
    const res = await fetch(`/api/app/quotes/${quoteId}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) {
      alert(data?.error ?? "Couldn't duplicate the quote.");
      return;
    }
    router.push(`/app/quotes/${data.id}`);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {sentTo && (
        // Floating pill on every screen size (desktop used to demote it to
        // inline text); outer span owns the centering so the entrance
        // animation's transform doesn't fight -translate-x-1/2
        <span className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-8 z-40 max-w-[calc(100vw-2rem)]">
          <span className="msg-enter block truncate rounded-full bg-gray-900/95 px-4 py-2 text-xs font-medium text-white shadow-lg">
            Emailed to {sentTo}
          </span>
        </span>
      )}

      {/* Primary action follows the lifecycle (Jobber behavior). With a client
          email on file, actually SEND the quote — "Mark as Sent" alone made
          owners think the app had emailed something when it hadn't. */}
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
            onClick={() => setStatus("AWAITING_RESPONSE")}
            title="No client email on file — this only marks the quote as sent"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
          >
            <Send size={13} />
            Mark as Sent
          </button>
        ))}
      {(status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
        <button
          onClick={() => setStatus("APPROVED")}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <CheckCircle size={13} />
          Mark Approved
        </button>
      )}
      {/* Approved quotes convert — unless an agreement-requiring service is
          waiting on a signature (price-book flag) */}
      {status === "APPROVED" && !hasJob && agreement && !agreement.signed ? (
        agreement.sent ? (
          <span className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium rounded-lg">
            <Clock size={13} />
            Awaiting agreement signature
          </span>
        ) : (
          <button
            onClick={() => setAgreementOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
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
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
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
          className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Reopen Quote
        </button>
      )}

      {/* Standalone edit button is desktop-only — the ⋯ menu covers it on
          mobile, where the action row is already tight after a send */}
      {editable && (
        <Link
          href={`/app/quotes/${quoteId}/edit`}
          className="hidden lg:block p-2 btn-tool-line bg-white rounded-[10px] text-gray-600 hover:bg-gray-50 transition-colors"
          title="Edit quote"
        >
          <Pencil size={15} />
        </Link>
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
            <a
              href={`/api/app/quotes/${quoteId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileDown size={14} className="text-gray-400" />
              Download PDF
            </a>
            <button
              onClick={duplicateQuote}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <CopyPlus size={14} className="text-gray-400" />
              Duplicate Quote
            </button>
            {contactEmail && status === "DRAFT" && (
              <button
                onClick={() => setStatus("AWAITING_RESPONSE")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CheckCircle size={14} className="text-gray-400" />
                Mark as Sent (no email)
              </button>
            )}
            {contactEmail && (status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
              <button
                onClick={emailToClient}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Send size={14} className="text-gray-400" />
                Email to client again
              </button>
            )}
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
        <div className="modal-pop fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !busy && setAgreementOpen(false)}
          />
          <div className="modal-card relative w-full max-w-md card-ledger bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Send agreement</h2>
            <p className="text-sm text-gray-600 mb-4">
              This quote includes services that require a signed agreement before work starts.
              The signing link is emailed to your client; the quote unlocks when they sign.
            </p>
            {agreement.templates.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                No agreement templates yet — create one under Settings → Contract Templates
                first.
              </p>
            ) : (
              <>
                <label className="block text-xs text-gray-500 mb-1">Agreement template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
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
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full"
              >
                Cancel
              </button>
              {agreement.templates.length > 0 && (
                <button
                  onClick={sendAgreement}
                  disabled={busy || !templateId}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />}
                  Send Agreement
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <SendOverlay to={sendShow} onDone={() => setSendShow(null)} />
    </div>
  );
}
