"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Pencil, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/** Contract controls: copy the signing link, edit while unsigned, void/reopen, delete. */
export default function ContractActions({
  contractId,
  status,
  signUrl,
  canDelete,
  title,
  body,
}: {
  contractId: string;
  status: string;
  signUrl: string;
  canDelete: boolean;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title, body });

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
    if (!confirm("Delete this contract? The signed record is destroyed with it. This can't be undone.")) return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/contracts/${contractId}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/contacts");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {status !== "VOID" && (
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy Signing Link"}
          </button>
        )}
        <a
          href={signUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 border border-gray-300 rounded text-gray-500 hover:bg-gray-50"
          title="Open signing page"
        >
          <ExternalLink size={15} />
        </a>
        {status !== "SIGNED" && (
          <button
            onClick={openEdit}
            className="p-2 border border-gray-300 rounded text-gray-500 hover:bg-gray-50"
            title="Edit contract"
          >
            <Pencil size={15} />
          </button>
        )}
        {status !== "SIGNED" && (
          <button
            onClick={() => patch({ status: status === "VOID" ? "SENT" : "VOID" })}
            disabled={busy}
            className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : status === "VOID" ? "Reopen" : "Void"}
          </button>
        )}
        {canDelete && (
          <button
            onClick={remove}
            disabled={busy}
            className="p-2 border border-gray-300 rounded text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50"
            title="Delete contract"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {error && !editing && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          {error}
          <button onClick={() => setError("")}>
            <X size={12} />
          </button>
        </p>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !busy && setEditing(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-lg shadow-xl p-5 space-y-3 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">Edit Contract</h2>
            <p className="text-xs text-gray-500">
              Editable until the client signs. If it was already sent, the signing link shows the
              updated text.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={busy}
                className="flex items-center gap-1.5 px-4 py-2 chamfer bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
