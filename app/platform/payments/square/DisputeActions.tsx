"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, MessageSquareText, Send, Upload } from "lucide-react";
import { Chip } from "@/components/ds";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { EVIDENCE_TYPE_OPTIONS, evidenceTypeLabel } from "./labels";

export type EvidenceItem = {
  id: string;
  evidenceType: string | null;
  fileName: string | null;
  text: string | null;
  uploadedAt: string | null;
};

/**
 * One Square dispute's evidence and the three things a manager can do about
 * it: add a file (PDF / JPG / PNG, 5 MB — Square's limit), add a written
 * explanation, send the evidence to the bank now (SubmitEvidence — after
 * which nothing can be added), or accept the dispute (the money goes back
 * to the cardholder; cannot be undone — hence the confirm). Everything goes
 * straight through to Square; nothing is stored here. The Finix-era
 * DisputeEvidence.tsx is the same idea for the other processor.
 */
export default function DisputeActions({
  disputeId,
  initialEvidence,
  open,
  canAct,
  amountLabel,
}: {
  disputeId: string;
  initialEvidence: EvidenceItem[];
  /** Square still takes evidence / accept for this dispute. */
  open: boolean;
  /** Manager role — otherwise the list is read-only. */
  canAct: boolean;
  amountLabel: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [evidenceType, setEvidenceType] = useState(EVIDENCE_TYPE_OPTIONS[0].value);
  const [text, setText] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<"upload" | "text" | "submit" | "accept" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const base = `/api/app/payments/square/disputes/${encodeURIComponent(disputeId)}`;

  function fail(data: { error?: string; code?: string } | null, fallback: string) {
    if (data?.code === "MISSING_SCOPES") setError("Reconnect Square in Settings → Payments & accounting first.");
    else setError(data?.error ?? fallback);
  }

  async function upload(file: File) {
    setBusy("upload");
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("evidenceType", evidenceType);
      const res = await fetch(`${base}/evidence`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return fail(data, "Upload failed. Please try again.");
      setEvidence((prev) => [data.evidence, ...prev]);
      router.refresh();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function addText() {
    const body = text.trim();
    if (!body) return;
    setBusy("text");
    setError(null);
    setNotice(null);
    const { ok, data } = await postJson<{ evidence: EvidenceItem }>(`${base}/evidence`, { text: body, evidenceType: "REBUTTAL_EXPLANATION" });
    setBusy(null);
    if (!ok) return fail(data, GENERIC_ERROR);
    if (data) setEvidence((prev) => [data.evidence, ...prev]);
    setText("");
    setWriting(false);
    router.refresh();
  }

  async function submit() {
    const sure = await confirmSheet({
      title: "Send this evidence to the bank?",
      message: "Square passes everything uploaded so far to the cardholder's bank. After this you can't add or remove anything; the bank's decision usually takes a few weeks.",
      confirmLabel: "Send evidence",
    });
    if (!sure) return;
    setBusy("submit");
    setError(null);
    const { ok, data } = await postJson(`${base}/submit`);
    setBusy(null);
    if (!ok) return fail(data, GENERIC_ERROR);
    setNotice("Sent — the bank is reviewing it.");
    router.refresh();
  }

  async function accept() {
    const sure = await confirmSheet({
      title: `Accept this dispute for ${amountLabel}?`,
      message: `Square returns ${amountLabel} to the cardholder from your balance and closes the dispute. This can't be undone.`,
      confirmLabel: "Accept dispute",
      destructive: true,
    });
    if (!sure) return;
    setBusy("accept");
    setError(null);
    const { ok, data } = await postJson(`${base}/accept`);
    setBusy(null);
    if (!ok) return fail(data, GENERIC_ERROR);
    setNotice("Accepted — the money goes back to the cardholder.");
    router.refresh();
  }

  const spinning = (k: typeof busy) => busy === k;

  return (
    <div className="w-full">
      {evidence.length > 0 ? (
        <ul className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {evidence.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
              {e.text ? <MessageSquareText size={14} className="mt-0.5 shrink-0 text-gray-400" /> : <FileText size={14} className="mt-0.5 shrink-0 text-gray-400" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">{e.fileName ?? (e.text ? "Written explanation" : "Evidence")}</span>
                <span className="block text-xs text-gray-500">
                  {evidenceTypeLabel(e.evidenceType)}
                  {e.uploadedAt ? ` · ${new Date(e.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
                {e.text && <span className="mt-1 block whitespace-pre-wrap text-xs text-gray-600">{e.text}</span>}
              </span>
              <Chip tone="good">Uploaded</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-gray-500">{open ? "No evidence uploaded yet." : "No evidence was uploaded."}</p>
      )}

      {canAct && open && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value)}
              aria-label="What this file is"
              className="h-[34px] rounded-[10px] border border-gray-300 bg-white px-2.5 text-[13px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
            >
              {EVIDENCE_TYPE_OPTIONS.filter((o) => o.value !== "REBUTTAL_EXPLANATION").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null} className="ds-btn ds-btn-outline ds-btn-sm disabled:opacity-50">
              {spinning("upload") ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {spinning("upload") ? "Uploading…" : "Upload a file"}
            </button>
            <button type="button" onClick={() => setWriting((w) => !w)} disabled={busy !== null} className="ds-btn ds-btn-ghost ds-btn-sm disabled:opacity-50">
              <MessageSquareText size={13} />
              Write an explanation
            </button>
          </div>
          {writing && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="What happened, in plain words — the work done, when, and what the client agreed to."
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500">{text.length}/500</span>
                <button type="button" onClick={addText} disabled={busy !== null || !text.trim()} className="ds-btn ds-btn-primary ds-btn-sm disabled:opacity-50">
                  {spinning("text") ? <Loader2 size={13} className="animate-spin" /> : null}
                  Add explanation
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <button type="button" onClick={submit} disabled={busy !== null || evidence.length === 0} className="ds-btn ds-btn-primary ds-btn-sm disabled:opacity-50">
              {spinning("submit") ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send evidence to the bank
            </button>
            <button type="button" onClick={accept} disabled={busy !== null} className="text-xs font-medium text-[color:var(--ds-bad)] hover:opacity-80 disabled:opacity-50">
              {spinning("accept") ? <Loader2 size={12} className="inline animate-spin" /> : null} Accept the dispute instead
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[color:var(--ds-bad)]">{error}</p>}
      {notice && <p className="mt-2 text-xs text-[color:var(--ds-good)]">{notice}</p>}
    </div>
  );
}
