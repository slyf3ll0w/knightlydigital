"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Check, FileText, Loader2, MoreHorizontal, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";

/**
 * Appointment lifecycle controls: Complete (→ Create Quote CTA), No-show,
 * Cancel, Reopen, inline reschedule, and delete (managers).
 */

function toLocalInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AppointmentActions({
  appointmentId,
  status,
  contactId,
  requestId,
  canDelete,
  scheduledAt,
  scheduledEnd,
  scheduledAnytime,
}: {
  appointmentId: string;
  status: string;
  contactId: string;
  requestId: string | null;
  canDelete: boolean;
  scheduledAt: string;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [anytime, setAnytime] = useState(scheduledAnytime);
  const [start, setStart] = useState(toLocalInput(scheduledAt));
  const [end, setEnd] = useState(toLocalInput(scheduledEnd));

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/appointments/${appointmentId}`, body, "PATCH");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return false;
    }
    setMenuOpen(false);
    router.refresh();
    return true;
  }

  async function remove() {
    if (!confirm("Delete this appointment? This can't be undone.")) return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/appointments/${appointmentId}`, {}, "DELETE");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/schedule");
  }

  async function saveReschedule() {
    const ok = await patch(
      anytime
        ? {
            scheduledAt: localInputToISO(`${start.slice(0, 10)}T12:00`),
            scheduledEnd: null,
            scheduledAnytime: true,
          }
        : {
            scheduledAt: localInputToISO(start),
            scheduledEnd: localInputToISO(end),
            scheduledAnytime: false,
          }
    );
    if (ok) setRescheduling(false);
  }

  const quoteHref = `/app/quotes/new?contactId=${contactId}${requestId ? `&requestId=${requestId}` : ""}`;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {status === "SCHEDULED" && (
          <button
            onClick={() => patch({ status: "COMPLETED" })}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Mark Completed
          </button>
        )}
        {status === "COMPLETED" && (
          <Link
            href={quoteHref}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
          >
            <FileText size={14} />
            Create Quote
          </Link>
        )}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 border border-gray-300 rounded text-gray-500 hover:bg-gray-50"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-lg shadow-xl ring-1 ring-black/5 py-1.5">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setRescheduling(true);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CalendarDays size={13} className="text-gray-400" />
                Reschedule
              </button>
              {status === "SCHEDULED" && (
                <>
                  <button
                    onClick={() => patch({ status: "NO_SHOW" })}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <X size={13} className="text-gray-400" />
                    Mark No-show
                  </button>
                  <button
                    onClick={() => patch({ status: "CANCELLED" })}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <X size={13} className="text-gray-400" />
                    Cancel Appointment
                  </button>
                </>
              )}
              {status !== "SCHEDULED" && (
                <button
                  onClick={() => patch({ status: "SCHEDULED" })}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <CalendarDays size={13} className="text-gray-400" />
                  Reopen
                </button>
              )}
              {canDelete && (
                <button
                  onClick={remove}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {rescheduling && (
        <div className="flex flex-wrap items-end justify-end gap-2 bg-white border border-gray-200 rounded-lg p-3">
          {anytime ? (
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Date</label>
              <input
                type="date"
                value={start.slice(0, 10)}
                onChange={(e) => setStart(`${e.target.value}T12:00`)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          ) : (
            <>
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
            </>
          )}
          <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={anytime}
              onChange={(e) => setAnytime(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            Anytime
          </label>
          <button
            onClick={saveReschedule}
            disabled={busy}
            className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={() => setRescheduling(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X size={15} />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
