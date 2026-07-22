"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Plus, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Reusable contract templates. {{client_name}}, {{company_name}}, and
 * {{date}} fill in automatically when a contract is created from one.
 */

type Template = { id: string; name: string; body: string; isActive: boolean };

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function ContractTemplatesClient({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = templates.filter((t) => t.isActive);
  const archived = templates.filter((t) => !t.isActive);

  function startNew() {
    setEditing("new");
    setName("");
    setBody(
      "This Service Agreement is made on {{date}} between {{company_name}} and {{client_name}}.\n\n1. Services. \n\n2. Payment. \n\n3. Term & cancellation. \n"
    );
  }

  function startEdit(t: Template) {
    setEditing(t.id);
    setName(t.name);
    setBody(t.body);
  }

  async function save() {
    setBusy(true);
    setError("");
    const { ok, data } =
      editing === "new"
        ? await postJson("/api/app/contract-templates", { name, body }, "POST")
        : await postJson(`/api/app/contract-templates/${editing}`, { name, body }, "PATCH");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function setActive(id: string, isActive: boolean) {
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/contract-templates/${id}`, { isActive }, "PATCH");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Link href="/app/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Contract Templates</h1>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          <Plus size={15} />
          New Template
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-8">
        Write your agreements once, send them to any client for an e-signature.
        {" "}<code className="text-xs bg-gray-100 px-1 rounded-lg">{"{{client_name}}"}</code>,{" "}
        <code className="text-xs bg-gray-100 px-1 rounded-lg">{"{{company_name}}"}</code> and{" "}
        <code className="text-xs bg-gray-100 px-1 rounded-lg">{"{{date}}"}</code> fill in automatically.
      </p>

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {editing !== null && (
        <div className="card-ledger p-5 mb-5 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Template name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Recurring Lawn Care Agreement"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Contract text *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className={`${inputCls} font-mono text-xs leading-relaxed`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy || !name.trim() || !body.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Save Template
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card-ledger divide-y divide-gray-100 mb-6">
        {active.length === 0 && editing === null && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">
            No templates yet — write your first service agreement to reuse on every client.
          </p>
        )}
        {active.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{t.name}</p>
              <p className="text-xs text-gray-500 truncate">{t.body.slice(0, 120)}</p>
            </div>
            <button
              onClick={() => startEdit(t)}
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
              title="Edit template"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setActive(t.id, false)}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Archive
            </button>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Archived</h2>
          <div className="card-ledger divide-y divide-gray-100">
            {archived.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 opacity-70">
                <p className="text-sm text-gray-700">{t.name}</p>
                <button
                  onClick={() => setActive(t.id, true)}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
