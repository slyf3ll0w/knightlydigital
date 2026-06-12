"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Permanently delete a client. No work attached → quick confirm (spam
 * cleanup). Has work → danger modal that lists exactly what gets destroyed
 * and requires typing the client's name (force delete for test clients and
 * no-longer-relevant records).
 */
export default function DeleteContactButton({
  contactId,
  contactName,
  counts,
}: {
  contactId: string;
  contactName: string;
  counts: {
    requests: number;
    appointments: number;
    quotes: number;
    jobs: number;
    invoices: number;
    payments: number;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasWork =
    counts.quotes > 0 || counts.jobs > 0 || counts.invoices > 0 || counts.payments > 0 ||
    counts.appointments > 0;

  const lines = [
    [counts.requests, "request", "requests"],
    [counts.appointments, "appointment", "appointments"],
    [counts.quotes, "quote", "quotes"],
    [counts.jobs, "job", "jobs"],
    [counts.invoices, "invoice", "invoices"],
    [counts.payments, "payment record", "payment records"],
  ].filter(([n]) => (n as number) > 0) as [number, string, string][];

  // Forgiving match: stored names can carry doubled/odd whitespace (imports,
  // web forms) that's invisible when typing — collapse it on both sides.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const nameMatches = norm(confirmText) === norm(contactName);

  async function doDelete(force: boolean) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/contacts/${contactId}${force ? "?force=1" : ""}`,
      undefined,
      "DELETE"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/contacts");
    router.refresh();
  }

  function onClick() {
    setError("");
    if (!hasWork) {
      if (confirm("Permanently delete this client and their requests? This can't be undone.")) {
        doDelete(false);
      }
      return;
    }
    setConfirmText("");
    setOpen(true);
  }

  return (
    <>
      <button
        onClick={onClick}
        title="Delete client"
        className="p-2 border border-gray-300 rounded text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors"
      >
        <Trash2 size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={17} className="text-red-600" />
              </span>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Delete {contactName} — and everything attached?
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              This permanently destroys their entire history. There is no undo.
            </p>

            <ul className="mb-4 rounded border border-red-100 bg-red-50 p-3 text-sm text-red-800 space-y-0.5">
              {lines.map(([n, one, many]) => (
                <li key={many}>
                  • {n} {n === 1 ? one : many}
                </li>
              ))}
            </ul>

            <label className="block text-xs text-gray-500 mb-1">
              Type <span className="font-semibold text-gray-700">{contactName}</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            />

            {confirmText && !nameMatches && (
              <p className="text-xs text-amber-600 mb-3">
                That doesn&apos;t match the client&apos;s name yet.
              </p>
            )}
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(true)}
                disabled={!nameMatches || busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-40"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
