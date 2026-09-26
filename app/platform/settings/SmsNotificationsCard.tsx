"use client";

import { useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { SMS_TERMS_URL } from "@/lib/sms-consent";

/**
 * The one-time company switch for provider texts (Company.smsAcknowledgedAt).
 * Off until a manager turns it on here; that click is the attestation that the
 * business's clients gave it their numbers, which is what makes informational
 * texts (reminders, schedule changes, quote/invoice links) legitimate without
 * a per-client opt-in. lib/sms.ts sendSms refuses while it is off.
 */
export default function SmsNotificationsCard({
  initialOnAt,
  hasLine = false,
}: {
  initialOnAt: string | null;
  /** The company has a business line — texts send from it (copy changes; the switch is the same). */
  hasLine?: boolean;
}) {
  const [onAt, setOnAt] = useState<string | null>(initialOnAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle(next: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsAcknowledged: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setOnAt(next ? new Date().toISOString() : null);
    } catch {
      setError("Couldn't save that. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="ds-card p-5 space-y-4">
      <SectionHeader
        title={
          <>
            <MessageSquareText size={15} className="text-[color:var(--ds-faint)]" />
            Text Notifications
          </>
        }
        hint={
          <>
            Appointment reminders, schedule changes, and quote and invoice links go to your clients
            by text from {hasLine ? "your business line" : "your business line (set one up above)"}, in
            your business&apos;s name. Every client with a phone number gets them unless you switch
            that client off or they reply STOP.
          </>
        }
      />
      {onAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-700">
            <span className="inline-block h-2 w-2 rounded-full bg-[color:var(--ds-good)] mr-2 align-middle" />
            On since {new Date(onAt).toLocaleDateString()}
          </p>
          <button
            type="button"
            onClick={() => toggle(false)}
            disabled={busy}
            className="text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
          >
            Turn off
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            By turning this on you confirm your clients gave you their phone numbers for your
            services and that you&apos;re responsible for texts sent on your behalf. Clients can
            opt out any time by replying STOP.{" "}
            <a href={SMS_TERMS_URL} target="_blank" rel="noreferrer" className="underline">
              Text terms
            </a>
          </p>
          <button
            type="button"
            onClick={() => toggle(true)}
            disabled={busy}
            className="ds-btn ds-btn-primary disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Turn on text notifications
          </button>
        </div>
      )}
      {error && <p className="text-xs text-[color:var(--ds-bad)]">{error}</p>}
    </div>
  );
}
