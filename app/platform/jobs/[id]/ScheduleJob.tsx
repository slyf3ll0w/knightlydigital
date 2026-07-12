"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";
import SlotTimePicker from "@/components/SlotTimePicker";
import { addMinutesToLocalDateTime } from "@/lib/scheduling";

const SLOT_INPUT_CLS =
  "px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

function toLocalInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDate(d: string | null): string {
  return toLocalInput(d).slice(0, 10);
}

export default function ScheduleJob({
  jobId,
  scheduledAt,
  scheduledEnd,
  scheduledAnytime,
  intervalMinutes = 30,
}: {
  jobId: string;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  intervalMinutes?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [anytime, setAnytime] = useState(scheduledAnytime);
  const [start, setStart] = useState(toLocalInput(scheduledAt));
  const [end, setEnd] = useState(toLocalInput(scheduledEnd));
  const [day, setDay] = useState(toLocalDate(scheduledAt));

  async function save() {
    setError("");
    setLoading(true);
    const body = anytime
      ? {
          // date-only: anchor at noon so the date survives timezone shifts
          scheduledAt: day ? localInputToISO(`${day}T12:00`) : null,
          scheduledEnd: null,
          scheduledAnytime: Boolean(day),
        }
      : {
          scheduledAt: localInputToISO(start),
          scheduledEnd: localInputToISO(end),
          scheduledAnytime: false,
        };
    const { ok, data } = await postJson(`/api/app/jobs/${jobId}`, body, "PATCH");
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
          ? scheduledAnytime
            ? `${new Date(scheduledAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })} — Anytime`
            : new Date(scheduledAt).toLocaleString("en-US", {
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
      {anytime ? (
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Date</label>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Start</label>
            <SlotTimePicker
              value={start}
              intervalMinutes={intervalMinutes}
              inputCls={SLOT_INPUT_CLS}
              ariaLabel="Start"
              onChange={(next) => {
                setStart(next);
                // Auto-fill the end one interval later when it isn't set yet, so
                // a single pick produces a valid block; the user can still adjust.
                if (!end && next) setEnd(addMinutesToLocalDateTime(next, intervalMinutes));
              }}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">End</label>
            <SlotTimePicker
              value={end}
              intervalMinutes={intervalMinutes}
              inputCls={SLOT_INPUT_CLS}
              ariaLabel="End"
              onChange={setEnd}
            />
          </div>
        </>
      )}
      <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600 select-none">
        <input
          type="checkbox"
          checked={anytime}
          onChange={(e) => {
            setAnytime(e.target.checked);
            if (e.target.checked && !day && start) setDay(start.slice(0, 10));
          }}
          className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        Anytime (no set time)
      </label>
      <button
        onClick={save}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50"
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
