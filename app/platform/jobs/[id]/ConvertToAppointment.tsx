"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";

/**
 * Jobs end with Complete Job → invoice. An estimate, a consult, or a 1-on-1
 * with another owner is a conversation — it ends with an optional quote,
 * and the quote is what becomes the job if the client approves. This is
 * the one-tap correction for a job that was booked as the wrong record:
 * same client, time, address, and notes; the job row goes away.
 */
export async function convertJobToAppointment(
  jobId: string,
  router: { push: (href: string) => void }
): Promise<boolean> {
  if (
    !(await confirmSheet({
      title: "Make this an appointment?",
      message:
        "The client, time, address, crew lead, and notes carry over. It stops being a job: no invoice, no time clock — it ends with an optional quote instead.",
      confirmLabel: "Make It an Appointment",
    }))
  )
    return false;
  const res = await fetch(`/api/app/jobs/${jobId}/to-appointment`, { method: "POST" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    alertSheet({ message: data?.error ?? "Couldn't turn this job into an appointment." });
    return false;
  }
  router.push(`/app/appointments/${data.id}`);
  return true;
}

/** The nudge under the job header when its title reads like a sales visit. */
export default function ConvertToAppointmentNotice({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      await convertJobToAppointment(jobId, router);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--ds-r)] bg-[color:var(--ds-warn-soft)] px-4 py-3 text-sm text-[color:var(--ds-ink)]">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">This looks like an appointment, not a job.</span>{" "}
        Jobs end with an invoice; estimates and meetings end with an optional quote.
      </p>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="ds-btn ds-btn-outline ds-btn-sm shrink-0 disabled:opacity-60"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
        Make it an appointment
      </button>
    </div>
  );
}
