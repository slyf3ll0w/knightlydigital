"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, Archive, ArchiveRestore, Loader2, MoreHorizontal, Pencil, Trash2, X,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * The client page's ⋯ menu: Edit / Archive ⇄ Reactivate / Delete.
 *
 * Archive is the safe way off the books — the client disappears from the
 * default list but every quote, job, and invoice stays. Delete stays for
 * spam cleanup (quick confirm) and test-data wipes (type-the-name danger
 * modal, managers only).
 */
export default function ContactActionsMenu({
  contactId,
  contactName,
  status,
  canDelete,
  counts,
}: {
  contactId: string;
  contactName: string;
  status: string;
  canDelete: boolean;
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const archived = status === "ARCHIVED";
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

  async function setStatus(next: "ACTIVE" | "ARCHIVED") {
    setOpen(false);
    if (
      next === "ARCHIVED" &&
      !confirm("Archive this client? They'll be hidden from your client list, but all their quotes, jobs, and invoices stay.")
    ) {
      return;
    }
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/contacts/${contactId}`, { status: next }, "PATCH");
    setBusy(false);
    if (!ok) {
      alert(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

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

  function onDeleteClick() {
    setOpen(false);
    setError("");
    if (!hasWork) {
      if (confirm("Permanently delete this client and their requests? This can't be undone.")) {
        doDelete(false);
      }
      return;
    }
    setConfirmText("");
    setDeleteOpen(true);
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Client actions"
          className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
            <Link
              href={`/app/contacts/${contactId}/edit`}
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={14} className="text-gray-400" />
              Edit
            </Link>
            {archived ? (
              <button
                onClick={() => setStatus("ACTIVE")}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ArchiveRestore size={14} className="text-gray-400" />
                Reactivate
              </button>
            ) : (
              <button
                onClick={() => setStatus("ARCHIVED")}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            )}
            {canDelete && (
              <>
                <div className="my-1 h-px bg-gray-100" />
                <button
                  onClick={onDeleteClick}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setDeleteOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={17} className="text-red-600" />
              </span>
              <button
                onClick={() => setDeleteOpen(false)}
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
              This permanently destroys their entire history. There is no undo. If you just want
              them off your list, archive them instead.
            </p>

            <ul className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800 space-y-0.5">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
            />

            {confirmText && !nameMatches && (
              <p className="text-xs text-amber-600 mb-3">
                That doesn&apos;t match the client&apos;s name yet.
              </p>
            )}
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(true)}
                disabled={!nameMatches || busy}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-[10px] transition-colors disabled:opacity-40"
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
