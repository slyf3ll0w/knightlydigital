"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "lucide-react";
import { smsHref, isApplePlatform, canSendSms } from "@/lib/messaging";

/**
 * Opens the tech's own Messages app pre-filled with the company's
 * "on my way" template (free — no SMS provider involved), and logs the
 * hand-off on the job. The tech can tweak the message before hitting send.
 */
export default function OnMyWay({
  jobId,
  phone,
  message,
  sentAt,
}: {
  jobId: string;
  phone: string;
  message: string;
  sentAt: string | null;
}) {
  const router = useRouter();
  const [sent, setSent] = useState<Date | null>(sentAt ? new Date(sentAt) : null);

  // Only render on devices with a texting app (phones, tablets, Macs) —
  // sms: goes nowhere on a Windows/Linux desktop. Post-mount check so the
  // server render (which can't sniff the device) matches the first paint.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canSendSms()), []);
  if (!supported) return null;

  function send() {
    // Log first (fire-and-forget), then hand off to Messages. The sms: link
    // opens the native app without unloading this page, so the refresh below
    // pulls the activity note in once the request lands.
    setSent(new Date());
    fetch(`/api/app/jobs/${jobId}/on-my-way`, { method: "POST" })
      .then(() => router.refresh())
      .catch(() => {});
    window.location.href = smsHref(phone, message, isApplePlatform());
  }

  return (
    <button
      onClick={send}
      title={
        sent
          ? `Sent ${sent.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} — opens Messages again`
          : "Text the client that you're on your way (opens your Messages app)"
      }
      className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
    >
      <Navigation size={13} className={sent ? "text-green-600" : undefined} />
      On My Way{sent ? " ✓" : ""}
    </button>
  );
}
