"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { localInputToISO } from "@/lib/statuses";

/** Manager-only manual time entry (paper timesheet, forgotten clock-in). */
export default function AddEntry({
  users,
  jobs,
}: {
  users: { id: string; name: string }[];
  jobs: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [jobId, setJobId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    if (!start || !end) {
      setError("Start and end times are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/app/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        jobId: jobId || null,
        startedAt: localInputToISO(start),
        endedAt: localInputToISO(end),
        note: note.trim() || null,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error ?? "Couldn't save — try again.");
      return;
    }
    setOpen(false);
    setStart("");
    setEnd("");
    setNote("");
    setJobId("");
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mb-5">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-green-700 hover:underline"
        >
          <Plus size={14} />
          Add time entry
        </button>
      </div>
    );
  }

  return (
    <div className="card-ledger p-5 mb-5 space-y-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Add time entry
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-gray-600">
          Team member
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-600">
          Job <span className="font-normal text-gray-400">(optional)</span>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">— No job —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </label>
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
          End
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-gray-600">
        Note
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. from paper timesheet (optional)"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          Save entry
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
