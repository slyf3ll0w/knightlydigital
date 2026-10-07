"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2 } from "lucide-react";
import { alertSheet, confirmSheet } from "@/components/ConfirmSheet";
import { sentSummary } from "@/components/SendChoice";
import { showSendRitual } from "@/lib/send-ritual";
import { hapticImpact } from "@/lib/haptics";
import { postJson } from "@/lib/safe-fetch";
import type { SendChannels } from "@/lib/send-channels";

/**
 * "Scheduled for Fri, Oct 10 · 9:00 AM · Send now · Cancel" under a quote /
 * invoice header while a Send later is pending. Send now goes out by the
 * channels that were chosen; Cancel leaves the draft as it is.
 */
export default function ScheduledSendLine({
  kind,
  id,
  label,
  channels,
  email,
  phone,
}: {
  kind: "quote" | "invoice";
  id: string;
  /** "Fri, Oct 10, 9:00 AM" in the company's zone. */
  label: string;
  channels: SendChannels;
  email: string | null;
  phone: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"send" | "cancel" | null>(null);
  const base = `/api/app/${kind}s/${id}`;
  const how = [channels.email && email ? `email` : null, channels.text && phone ? `text` : null].filter(Boolean).join(" + ");

  async function sendNow() {
    if (busy) return;
    setBusy("send");
    // expectScheduled: the route answers 409 when the sweep already claimed
    // the row seconds ago, so the client isn't sent the same thing twice
    const res = await postJson<{ emailed?: boolean; texted?: boolean; to?: string | null; phone?: string | null }>(
      `${base}/send`,
      { ...channels, expectScheduled: true }
    );
    setBusy(null);
    if (!res.ok) {
      await alertSheet({ message: res.data?.error ?? `Couldn't send the ${kind}.` });
      if (res.status === 409) router.refresh();
      return;
    }
    hapticImpact("LIGHT");
    showSendRitual(sentSummary(res.data, { email, phone }));
    router.refresh();
  }

  async function cancel() {
    if (busy) return;
    const ok = await confirmSheet({
      title: "Cancel the scheduled send?",
      message: `The ${kind} stays a draft; nothing goes to the client until you send it.`,
      confirmLabel: "Cancel send",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return;
    setBusy("cancel");
    const res = await postJson(`${base}/schedule-send`, undefined, "DELETE");
    setBusy(null);
    if (!res.ok) {
      await alertSheet({ message: res.data?.error ?? "Couldn't cancel the scheduled send." });
      return;
    }
    router.refresh();
  }

  return (
    <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--ds-ink-2)]">
      <CalendarClock size={15} className="shrink-0 text-[color:var(--ds-primary)]" aria-hidden />
      <span>
        Scheduled for <span className="font-semibold text-[color:var(--ds-ink)]">{label}</span>
        {how ? ` by ${how}` : ""}
      </span>
      <span className="text-[color:var(--ds-faint)]" aria-hidden>
        ·
      </span>
      <button type="button" onClick={() => void sendNow()} disabled={busy !== null} className="font-semibold text-[color:var(--ds-primary)] hover:underline disabled:opacity-50">
        {busy === "send" ? <Loader2 size={13} className="inline animate-spin" /> : "Send now"}
      </button>
      <span className="text-[color:var(--ds-faint)]" aria-hidden>
        ·
      </span>
      <button type="button" onClick={() => void cancel()} disabled={busy !== null} className="font-semibold text-[color:var(--ds-ink-2)] hover:underline disabled:opacity-50">
        {busy === "cancel" ? <Loader2 size={13} className="inline animate-spin" /> : "Cancel"}
      </button>
    </p>
  );
}
