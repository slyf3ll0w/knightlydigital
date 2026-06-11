"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

function toLocalInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ScheduleJob({
  jobId,
  scheduledAt,
  scheduledEnd,
}: {
  jobId: string;
  scheduledAt: string | null;
  scheduledEnd: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [start, setStart] = useState(toLocalInput(scheduledAt));
  const [end, setEnd] = useState(toLocalInput(scheduledEnd));

  async function save() {
    setError("");
    setLoading(true);
    const { ok, data } = await postJson(
      `/api/app/jobs/${jobId}`,
      { scheduledAt: start || null, scheduledEnd: end || null },
      "PATCH"
    );
    setLoading(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 text-sm font-medium hover:underline ${
          scheduledAt ? "text-green-700" : "text-amber-600"
        }`}
      >
        <CalendarDays size={13} />
        {scheduledAt
          ? new Date(scheduledAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "Unscheduled — set a date"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Start</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">End</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      <button
        onClick={save}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
      >
        {loading && <Loader2 size={12} className="animate-spin" />}
        Save
      </button>
      <button
        onClick={() => setOpen(false)}
        className="p-1.5 text-gray-400 hover:text-gray-600"
      >
        <X size={15} />
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
