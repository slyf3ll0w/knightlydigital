"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Pencil, Send, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet } from "@/components/ConfirmSheet";
import Modal from "@/components/Modal";
import { InfoTip } from "@/components/ds";

/** Contract controls: copy the signing link, email it (again), edit while
 *  unsigned, void/reopen, delete. */
export default function ContractActions({
  contractId,
  status,
  signUrl,
  canDelete,
  title,
  body,
  contactEmail,
}: {
  contractId: string;
  status: string;
  signUrl: string;
  canDelete: boolean;
  title: string;
  body: string;
  /** Client's email on file — the resend button needs one. */
  contactEmail: string | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title, body });

  // Sent confirmation auto-dismisses — floats as a pill like quotes/invoices
  useEffect(() => {
    if (!sentTo) return;
    const t = setTimeout(() => setSentTo(""), 3000);
    return () => clearTimeout(t);
  }, [sentTo]);

  /** Email the signing link (again) — same email the create route sends;
   *  also refreshes the 30-day link expiry. */
  async function emailLink() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ to?: string }>(
      `/api/app/contracts/${contractId}/send`,
      undefined,
      "POST"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setSentTo(data?.to ?? contactEmail ?? "the client");
    router.refresh();
  }

  function openEdit() {
    setForm({ title, body });
    setError("");
    setEditing(true);
  }

  async function saveEdit() {
    if (!form.title.trim() || !form.body.trim()) {
      setError("The contract needs a title and body.");
      return;
    }
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/contracts/${contractId}`,
      { title: form.title, body: form.body },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError((data as { error?: string })?.error ?? GENERIC_ERROR);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(signUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/contracts/${contractId}`, body, "PATCH");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: "Delete this contract?",
        message: "The signed record is destroyed with it. This can't be undone.",
        confirmLabel: "Delete Contract",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/contracts/${contractId}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/contracts");
    router.refresh();
  }

  const unsigned = status === "SENT" || status === "DRAFT";

  return (
    <div className="flex flex-col items-end gap-2">
      {sentTo && (
        // Floating pill on every screen size; outer span owns the centering
        // so the entrance animation's transform doesn't fight -translate-x-1/2
        <span className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-8 z-40 max-w-[calc(100vw-2rem)]">
          <span className="msg-enter block truncate rounded-full bg-gray-900/95 px-4 py-2 text-xs font-medium text-white shadow-lg">
            Emailed to {sentTo}
          </span>
        </span>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status !== "VOID" && (
          <button
            onClick={copyLink}
            className="btn-primary"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy Signing Link"}
          </button>
        )}
        {unsigned && (
          <button
            onClick={emailLink}
            disabled={busy || !contactEmail}
            title={
              contactEmail
                ? `Email the signing link to ${contactEmail}`
                : "No client email on file — add one on the client page, or copy the signing link"
            }
            className="flex items-center gap-1.5 px-3 py-2 btn-tool-line bg-white rounded-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Send size={13} />
            {status === "DRAFT" ? "Email for Signature" : "Email Signing Link Again"}
          </button>
        )}
        <a
          href={signUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-500 hover:bg-gray-50"
          title="Open signing page"
        >
          <ExternalLink size={15} />
        </a>
        {status !== "SIGNED" && (
          <button
            onClick={openEdit}
            className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-500 hover:bg-gray-50"
            title="Edit contract"
          >
            <Pencil size={15} />
          </button>
        )}
        {status !== "SIGNED" && (
          <button
            onClick={() => patch({ status: status === "VOID" ? "SENT" : "VOID" })}
            disabled={busy}
            className="px-3 py-2 btn-tool-line bg-white rounded-[10px] text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : status === "VOID" ? "Reopen" : "Void"}
          </button>
        )}
        {canDelete && (
          <button
            onClick={remove}
            disabled={busy}
            className="p-2 btn-tool-line rounded-[10px] text-gray-400 hover:text-[color:var(--ds-bad)] hover:bg-[color:var(--ds-bad-soft)]"
            title="Delete contract"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {error && !editing && (
        <p className="flex items-center gap-1 text-xs text-[color:var(--ds-bad)]">
          {error}
          <button onClick={() => setError("")}>
            <X size={12} />
          </button>
        </p>
      )}

      <Modal
        open={editing}
        onClose={() => {
          if (!busy) setEditing(false);
        }}
        size="2xl"
      >
        {editing && (
          <div className="space-y-3 text-left">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-[color:var(--ds-ink)]">
              Edit Contract
              <InfoTip>
                Editable until the client signs. If it was already sent, the signing link shows the
                updated text.
              </InfoTip>
            </h2>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">
                Contract text
              </label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={14}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
            </div>

            {error && <p className="text-xs text-[color:var(--ds-bad)]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={busy}
                className="btn-primary"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
