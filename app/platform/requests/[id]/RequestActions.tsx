"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, FileText, Briefcase, Archive, Trash2, Pencil, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

export default function RequestActions({
  requestId,
  status,
  contactId,
  title,
  details,
}: {
  requestId: string;
  status: string;
  contactId: string;
  title: string;
  details: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title, details });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function setStatus(newStatus: string) {
    setOpen(false);
    try {
      await fetch(`/api/app/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } finally {
      router.refresh();
    }
  }

  function openEdit() {
    setForm({ title, details });
    setError("");
    setOpen(false);
    setEditing(true);
  }

  async function saveEdit() {
    if (!form.title.trim()) {
      setError("The request needs a title.");
      return;
    }
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/requests/${requestId}`,
      { title: form.title, details: form.details },
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

  async function deleteRequest() {
    setOpen(false);
    if (
      !confirm(
        "Permanently delete this request? If it's the only thing on a lead's record (spam), the lead is deleted with it. This can't be undone."
      )
    )
      return;
    const res = await fetch(`/api/app/requests/${requestId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Couldn't delete this request.");
      return;
    }
    router.push("/app/requests");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {status === "NEW" && (
        <button
          onClick={() =>
            router.push(`/app/quotes/new?contactId=${contactId}&requestId=${requestId}`)
          }
          className="px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors"
        >
          Convert to Quote
        </button>
      )}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
            <button
              onClick={openEdit}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Pencil size={14} className="text-gray-400" />
              Edit Request
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() =>
                router.push(`/app/quotes/new?contactId=${contactId}&requestId=${requestId}`)
              }
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={14} className="text-gray-400" />
              Convert to Quote
            </button>
            <button
              onClick={() =>
                router.push(`/app/jobs/new?contactId=${contactId}&requestId=${requestId}`)
              }
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Briefcase size={14} className="text-gray-400" />
              Convert to Job
            </button>
            <div className="my-1 border-t border-gray-100" />
            {status !== "ARCHIVED" ? (
              <button
                onClick={() => setStatus("ARCHIVED")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            ) : (
              <button
                onClick={() => setStatus("NEW")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Restore to New
              </button>
            )}
            <button
              onClick={deleteRequest}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} className="text-red-400" />
              Delete (spam)
            </button>
          </div>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !busy && setEditing(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-lg shadow-xl p-5 space-y-3 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">Edit Request</h2>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">
                Service details
              </label>
              <textarea
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                placeholder="What the client is asking for..."
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

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
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
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
