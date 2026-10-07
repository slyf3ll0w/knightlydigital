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
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { showSendRitual } from "@/lib/send-ritual";
import { showApproveRitual } from "@/lib/approve-ritual";
import Modal from "@/components/Modal";
import MenuPopover from "@/components/MenuPopover";
import InfoTip from "@/components/ds/InfoTip";
import { useSendChoice, sentSummary, type SendChoiceResult } from "@/components/SendChoice";
import { SCHEDULE_WARNING_TEXT, type ScheduleWarning } from "@/lib/send-later-shared";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

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
  contactPhone = "",
  canTextClient = false,
  agreement = null,
  hasDeposit = false,
  depositInvoiced = false,
  canDelete = false,
  scheduled = false,
}: {
  quoteId: string;
  status: string;
  publicUrl: string;
  hasJob: boolean;
  wasSent?: boolean;
  contactId?: string;
  contactEmail?: string;
  /** Formatted phone — the text recipient when the business line can send. */
  contactPhone?: string;
  /** The business line is registered and the client takes texts (lib/sms.ts). */
  canTextClient?: boolean;
  agreement?: AgreementState;
  hasDeposit?: boolean;
  depositInvoiced?: boolean;
  /** The DELETE route is managers-only — don't offer what would 403 */
  canDelete?: boolean;
  /** A Send later is pending — no "send this first?" nag on leaving */
  scheduled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [templateId, setTemplateId] = useState(agreement?.templates[0]?.id ?? "");
  const [agreementError, setAgreementError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { choose, chooser } = useSendChoice();
  const reachable = Boolean(contactEmail || canTextClient);
  // A draft nobody has sent yet: leaving the page asks first (David
  // 2026-10-03). In-app navigation only — no native prompt on a refresh.
  useUnsavedWarning(status === "DRAFT" && reachable && !scheduled, {
    title: "Send this quote first?",
    message: "The client hasn't been sent this quote yet.",
    confirmLabel: "Leave without sending",
    cancelLabel: "Stay",
    beforeUnload: false,
  });

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
      const res = await fetch(`/api/app/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alertSheet({ message: data?.error ?? "Couldn't update the quote." });
        return;
      }
      if (newStatus === "APPROVED") {
        hapticNotify("SUCCESS");
        // Body-attached like the send ritual — the refresh below swaps the
        // action buttons and would kill state-held overlays. The refreshed
        // page mounts <Celebration>, so this reads slam → confetti.
        showApproveRitual();
        // Approval mints the deposit invoice and emails its pay link; when
        // that email can't go out the office has to send it by hand.
        if (data?.emailed === false && data?.deposit?.invoiceNumber) {
          alertSheet({
            message: `Approved. Deposit invoice #${data.deposit.invoiceNumber} was created, but the pay link couldn't be emailed — send it from the invoice.`,
          });
        }
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  // Send later: park the draft to go out at the chosen time by the chosen
  // channels (lib/send-document.ts runScheduledSends does the real send)
  async function scheduleLater(c: SendChoiceResult) {
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/schedule-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: c.later?.date, time: c.later?.time, email: c.email, text: c.text }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; label?: string; warnings?: ScheduleWarning[] } | null;
      if (!res.ok) {
        alertSheet({ message: data?.error ?? "Couldn't schedule the send." });
        return;
      }
      hapticImpact("LIGHT");
      const warn = (data?.warnings ?? []).map((w) => SCHEDULE_WARNING_TEXT[w]).join(" ");
      await alertSheet({
        title: `Scheduled for ${data?.label ?? "later"}`,
        message: warn || "It stays a draft you can edit until then. You'll get a notification when it goes out.",
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  // Email the client their approval link (marks the quote sent on success)
  async function emailToClient() {
    setOpen(false);
    // Email by default; Text is there to tick when the line can send — but
    // never ticked for you, and never sent on its own for a phone-only
    // client: the texting campaign was filed as "quotes go by email"
    // (2026-10-07). Invoices keep their both-ways default.
    const channels = await choose({
      email: contactEmail || null,
      phone: contactPhone || null,
      canText: canTextClient,
      what: "Send the quote",
      defaults: { email: true, text: false },
      textInfo:
        "Quotes are sent by email. Texting this one is your choice and never happens on its own — carriers treat quote texts as marketing.",
      allowLater: status === "DRAFT",
    });
    if (!channels) return;
    if (channels.later) {
      await scheduleLater(channels);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channels),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alertSheet({ message: data?.error ?? "Couldn't send the quote." });
        return;
      }
      const line = sentSummary(data, { email: contactEmail, phone: contactPhone });
      setSentTo(line);
      hapticImpact("LIGHT");
      // Body-attached on purpose — the refresh below swaps the action
      // buttons and would kill any overlay held in this component's state
      showSendRitual(line);
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
      if (data?.error) alertSheet({ message: data.error });
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
        alertSheet({ message: data?.error ?? "Couldn't create the deposit invoice." });
        return;
      }
      if (data?.emailed === false) {
        alertSheet({
          message: `Deposit invoice #${data.invoiceNumber} is ready, but the pay link couldn't be emailed — send it from the invoice.`,
        });
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
      alertSheet({ message: data?.error ?? "Couldn't delete this quote." });
    } finally {
      setBusy(false);
    }
  }

  const editable =
    status === "DRAFT" || status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED";

  // Duplicate into a fresh draft and jump straight to it
  async function duplicateQuote() {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        alertSheet({ message: data?.error ?? "Couldn't duplicate the quote." });
        return;
      }
      router.push(`/app/quotes/${data.id}`);
    } finally {
      setBusy(false);
    }
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
            {sentTo}
          </span>
        </span>
      )}

      {/* Primary action follows the lifecycle (Jobber behavior). With a client
          email on file, actually SEND the quote — "Mark as Sent" alone made
          owners think the app had emailed something when it hadn't. */}
      {chooser}
      {status === "DRAFT" &&
        (reachable ? (
          <button
            onClick={emailToClient}
            disabled={busy}
            className="btn-primary"
          >
            <Send size={13} />
            {canTextClient ? "Send to Client" : "Email to Client"}
          </button>
        ) : (
          <button
            onClick={() => setStatus("AWAITING_RESPONSE")}
            title="No client email or textable phone on file — this only marks the quote as sent"
            className="btn-primary"
          >
            <Send size={13} />
            Mark as Sent
          </button>
        ))}
      {(status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
        <button
          onClick={() => setStatus("APPROVED")}
          className="btn-primary"
        >
          <CheckCircle size={13} />
          Mark Approved
        </button>
      )}
      {/* Approved quotes convert — unless an agreement-requiring service is
          waiting on a signature (price-book flag) */}
      {status === "APPROVED" && !hasJob && agreement && !agreement.signed ? (
        agreement.sent ? (
          <span className="flex items-center gap-1.5 rounded-[12px] bg-[color:var(--ds-warn-soft)] px-4 py-2 text-sm font-medium text-[color:var(--ds-warn)]">
            <Clock size={13} />
            Awaiting agreement signature
          </span>
        ) : (
          <button
            onClick={() => setAgreementOpen(true)}
            className="btn-primary"
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
            disabled={busy}
            className="btn-primary"
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
          className="ds-btn ds-btn-outline"
        >
          <RotateCcw size={13} />
          Reopen Quote
        </button>
      )}

      {/* Standalone edit button is desktop-only — the ⋯ menu covers it on
          mobile, where the action row is already tight after a send */}
      {editable && (
        <Link
          prefetch={false} href={`/app/quotes/${quoteId}/edit`}
          className="hidden lg:block ds-btn-outline rounded-[10px] p-2 text-[color:var(--ds-ink-2)] transition-shadow"
          title="Edit quote"
        >
          <Pencil size={15} />
        </Link>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="ds-btn-outline rounded-[10px] p-2 text-[color:var(--ds-ink-2)] transition-shadow"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <MenuPopover open={open} onClose={() => setOpen(false)} title="Quote">
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
              disabled={busy}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <CopyPlus size={14} className="text-gray-400" />
              Duplicate Quote
            </button>
            {reachable && status === "DRAFT" && (
              <button
                onClick={() => setStatus("AWAITING_RESPONSE")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CheckCircle size={14} className="text-gray-400" />
                Mark as Sent (don&apos;t send)
              </button>
            )}
            {reachable && (status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
              <button
                onClick={emailToClient}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Send size={14} className="text-gray-400" />
                {canTextClient ? "Send to client again" : "Email to client again"}
              </button>
            )}
            <div className="my-1 border-t border-gray-100" />
            {(status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
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
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
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
                prefetch={false} href={`/app/quotes/${quoteId}/edit`}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={14} className="text-gray-400" />
                Edit Quote
              </Link>
            )}
            {canDelete && (
              <button
                onClick={deleteQuote}
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-[color:var(--ds-bad)] hover:bg-[color:var(--ds-bad-soft)] disabled:opacity-60"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </MenuPopover>
        )}
      </div>

      {/* Send-agreement modal: pick a template, signing link goes to the
          client's inbox; the quote unlocks once they sign */}
      <Modal
        open={agreementOpen && Boolean(agreement)}
        onClose={() => !busy && setAgreementOpen(false)}
      >
        {agreementOpen && agreement && (
          <>
            <h2 className="mb-4 flex items-center gap-1.5 text-lg font-bold text-gray-900">
              Send agreement
              <InfoTip>
                This quote includes services that require a signed agreement before work starts.
                The signing link is emailed to your client; the quote unlocks when they sign.
              </InfoTip>
            </h2>
            {agreement.templates.length === 0 ? (
              <p className="mb-4 rounded-[var(--ds-r-sm)] bg-[color:var(--ds-warn-soft)] px-3 py-2 text-sm text-[color:var(--ds-warn)]">
                No agreement templates yet — create one under{" "}
                <Link href="/app/contracts?view=templates" className="underline">
                  Agreements → Templates
                </Link>{" "}
                first.
              </p>
            ) : (
              <>
                <label className="block text-xs text-gray-500 mb-1">Agreement template</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)] mb-4"
                >
                  {agreement.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {agreementError && <p className="text-xs text-[color:var(--ds-bad)] mb-3">{agreementError}</p>}
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
                  className="btn-primary"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />}
                  Send Agreement
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
