"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";

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
      !(await confirmSheet({
        title: "Decline this booking?",
        message: "The request is archived and the reserved time is freed.",
        confirmLabel: "Decline Booking",
        destructive: true,
      }))
    ) {
      return;
    }
    setBusy(action);
    setError("");
    const { ok, data } = await postJson<{ error?: string; emailed?: boolean | null }>(
      `/api/app/requests/${requestId}/booking`,
      { action }
    );
    setBusy(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    if (data?.emailed === false) {
      // The decision landed; the client just wasn't told. Say so instead of
      // letting the office assume the confirmation went out.
      alertSheet({
        message:
          action === "accept"
            ? "Booking accepted — but the confirmation email couldn't be sent. Let the client know their time is confirmed."
            : "Booking declined — but the email couldn't be sent. Let the client know.",
      });
    }
    router.refresh();
  }

  return (
    <div className="ds-card mb-6 bg-[color:var(--ds-warn-soft)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarCheck size={18} className="text-[color:var(--ds-warn)] shrink-0" />
        <p className="flex-1 min-w-[220px] text-sm text-[color:var(--ds-ink)]">
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
            className="btn-primary"
          >
            {busy === "accept" && <Loader2 size={13} className="animate-spin" />}
            Accept and Schedule
          </button>
          <button
            onClick={() => act("decline")}
            disabled={busy !== null}
            className="px-4 py-2 rounded-[12px] text-sm font-semibold text-[color:var(--ds-bad)] border border-[color:var(--ds-bad)] hover:bg-[color:var(--ds-bad-soft)] transition-colors disabled:opacity-50"
          >
            {busy === "decline" && <Loader2 size={13} className="animate-spin inline mr-1" />}
            Decline
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </div>
  );
}
