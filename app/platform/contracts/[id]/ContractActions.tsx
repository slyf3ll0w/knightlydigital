"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/** Contract controls: copy the signing link, void/reopen, delete. */
export default function ContractActions({
  contractId,
  status,
  signUrl,
  canDelete,
}: {
  contractId: string;
  status: string;
  signUrl: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
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
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          {error}
          <button onClick={() => setError("")}>
            <X size={12} />
          </button>
        </p>
      )}
    </div>
  );
}
