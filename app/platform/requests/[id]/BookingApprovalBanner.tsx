"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Approval banner for self-scheduled online bookings: the client picked an
 * arrival window and is waiting. Accept confirms the tentative appointment;
 * Decline archives the request and frees the slot.
 */
export default function BookingApprovalBanner({
  requestId,
  clientName,
  windowLabel,
}: {
  requestId: string;
  clientName: string;
  windowLabel: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function act(action: "accept" | "decline") {
    if (
      action === "decline" &&
      !confirm("Decline this booking? The request is archived and the reserved time is freed.")
    ) {
      return;
    }
    setBusy(action);
    setError("");
    const { ok, data } = await postJson(`/api/app/requests/${requestId}/booking`, { action });
    setBusy(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarCheck size={18} className="text-red-600 shrink-0" />
        <p className="flex-1 min-w-[220px] text-sm text-red-900">
          <span className="font-semibold">{clientName} booked online</span>
          {windowLabel ? (
            <>
              {" "}
              for <span className="font-semibold">{windowLabel}</span> — the time is held on
              your schedule until you decide.
            </>
          ) : (
            <> — the booking needs your decision.</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => act("accept")}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {busy === "accept" && <Loader2 size={13} className="animate-spin" />}
            Accept and Schedule
          </button>
          <button
            onClick={() => act("decline")}
            disabled={busy !== null}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-red-700 border border-red-300 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {busy === "decline" && <Loader2 size={13} className="animate-spin inline mr-1" />}
            Decline
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
