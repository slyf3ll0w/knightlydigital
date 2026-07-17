"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { localInputToISO } from "@/lib/statuses";

/** ISO → datetime-local value in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Manager-only edit/delete for a timesheet entry (fix a forgotten clock-out). */
export default function EntryActions({
  entry,
}: {
  entry: { id: string; startedAt: string; endedAt: string | null; note: string | null };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(toLocalInput(entry.startedAt));
  const [end, setEnd] = useState(toLocalInput(entry.endedAt));
  const [note, setNote] = useState(entry.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/app/time-entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startedAt: localInputToISO(start),
        endedAt: end ? localInputToISO(end) : null,
        note: note.trim() || null,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error ?? "Couldn't save — try again.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (busy || !confirm("Delete this time entry?")) return;
    setBusy(true);
    await fetch(`/api/app/time-entries/${entry.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="p-1.5 text-gray-300 hover:text-gray-600 shrink-0"
        title="Edit entry"
      >
        <Pencil size={13} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm card-ledger bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Edit time entry</h3>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <label className="block text-xs font-medium text-gray-600">
          Start
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          End{" "}
          <span className="font-normal text-gray-400">(leave empty to keep them on the clock)</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          Note
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why the change (optional)"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={remove}
            disabled={busy}
            className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            <Trash2 size={12} />
            Delete
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
