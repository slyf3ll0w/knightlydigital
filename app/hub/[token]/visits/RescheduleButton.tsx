"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Check } from "lucide-react";

/** "Request reschedule" — opens a small note box, sends into the message
 *  thread. A request, not a self-serve write: the company confirms the move. */
export default function RescheduleButton({
  token,
  kind,
  id,
  title,
}: {
  token: string;
  kind: "job" | "appointment";
  id: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/hub/visits/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind, id, note }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't send the request. Please try again.");
      return;
    }
    setSent(true);
    setOpen(false);
  }

  if (sent) {
    return (
      <span className="flex items-center gap-1 shrink-0 text-xs font-medium text-green-700">
        <Check size={13} />
        Request sent
      </span>
    );
  }

  return (
    <div className="shrink-0">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <CalendarClock size={12} />
          Request reschedule
        </button>
      ) : (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Request a new time</h3>
            <p className="text-xs text-gray-500 mb-3">
              For <span className="font-medium text-gray-700">{title}</span>. Tell us what
              works better and we&apos;ll confirm.
            </p>
            {error && (
              <p className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {error}
              </p>
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Anytime Thursday afternoon, or next week works too"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={send}
                disabled={busy}
                className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Send request
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
