"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

/** Issue a contract: pick the client and a saved template (editable before
 *  sending), then share the signing link. */
export default function NewContractForm({
  contacts,
  templates,
  prefilledContactId,
}: {
  contacts: { id: string; firstName: string; lastName: string }[];
  templates: { id: string; name: string; body: string }[];
  prefilledContactId: string;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState(prefilledContactId);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    const { ok, data } = await postJson<{ id: string }>("/api/app/contracts", {
      contactId,
      templateId: templateId || null,
      title,
      body,
    });
    setBusy(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push(`/app/contracts/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/contacts" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">New Contract</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Client *</label>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputCls}>
              <option value="">Select a client...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
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
              <p className="text-xs text-gray-400 mt-1">
                No templates yet —{" "}
                <Link href="/app/settings/contracts" className="text-green-600 underline">
                  save one in Settings
                </Link>{" "}
                to reuse it.
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={create}
          disabled={busy || !contactId || !title.trim() || !body.trim()}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Create &amp; Get Signing Link
        </button>
      </div>
    </div>
  );
}
