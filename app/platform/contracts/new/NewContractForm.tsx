"use client";

import { useState } from "react";
import { inputCls } from "@/components/Input";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Send } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { InfoTip } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import ContactPicker from "@/components/ContactPicker";


/** Issue an agreement: pick the client and a saved template (editable before
 *  sending). Creating it EMAILS the client their signing link (the API does
 *  that on create) — the button says so. */
export default function NewContractForm({
  contacts,
  templates,
  prefilledContactId,
  backHref,
  canManageTemplates,
}: {
  contacts: { id: string; firstName: string; lastName: string }[];
  templates: { id: string; name: string; body: string }[];
  prefilledContactId: string;
  /** Where the back arrow lands — the client page when opened from one. */
  backHref: string;
  /** Managers get a link to add templates; others are told who to ask. */
  canManageTemplates: boolean;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState(prefilledContactId);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Set on success while the agreement page loads — the honest "it went out"
  // (or "it didn't — no email on file") moment, not a silent redirect
  const [sent, setSent] = useState<{ emailed: boolean; to: string | null } | null>(null);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setTitle(t.name);
      setBody(t.body);
    }
  }

  async function create() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ id: string; emailed?: boolean; emailedTo?: string | null }>(
      "/api/app/contracts",
      {
        contactId,
        templateId: templateId || null,
        title,
        body,
      }
    );
    if (!ok || !data?.id) {
      setBusy(false);
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    // Stay busy through the navigation so the button can't fire twice
    setSent({ emailed: Boolean(data.emailed), to: data.emailedTo ?? null });
    router.push(`/app/contracts/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackLink href={backHref} />
        <PageTitle>New Agreement</PageTitle>
      </div>

      <div className="ds-card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client *</label>
            <ContactPicker contacts={contacts} value={contactId} onChange={setContactId} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start from template</label>
            <select value={templateId} onChange={(e) => pickTemplate(e.target.value)} className={inputCls}>
              <option value="">Blank contract</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {canManageTemplates ? (
                  <>
                    No templates yet —{" "}
                    <Link href="/app/contracts?view=templates" className="text-[color:var(--ds-primary)] underline">
                      save one under Agreements → Templates
                    </Link>{" "}
                    to reuse it.
                  </>
                ) : (
                  <>No templates yet — ask an owner to add one under Agreements → Templates.</>
                )}
              </p>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Recurring Lawn Care Agreement"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Contract text * — {"{{client_name}}"}, {"{{company_name}}"} and {"{{date}}"} fill in when created
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className={`${inputCls} font-mono text-xs leading-relaxed`}
          />
        </div>
        {error && <p className="text-sm text-[color:var(--ds-bad)]">{error}</p>}
        {sent ? (
          <div
            role="status"
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              sent.emailed
                ? "border-transparent bg-[color:var(--ds-good-soft)] text-[color:var(--ds-good)]"
                : "border-transparent bg-[color:var(--ds-warn-soft)] text-[color:var(--ds-warn)]"
            }`}
          >
            {sent.emailed ? <Check size={15} /> : <Send size={15} />}
            {sent.emailed
              ? `Sent — signing link emailed to ${sent.to}. Opening the agreement…`
              : "Created — this client has no email on file, so copy the signing link from the agreement page. Opening it…"}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={create}
                disabled={busy || !contactId || !title.trim() || !body.trim()}
                className="btn-primary btn-lg"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Create &amp; Email for Signature
              </button>
              <InfoTip>
                The signing link goes straight to the client&apos;s inbox. No email on file? You can
                copy the link from the agreement page instead.
              </InfoTip>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
