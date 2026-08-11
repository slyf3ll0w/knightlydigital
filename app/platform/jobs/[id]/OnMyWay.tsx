"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Navigation } from "lucide-react";
import { smsHref, isApplePlatform, canSendSms, fillEta } from "@/lib/messaging";

/**
 * Opens the tech's own Messages app pre-filled with the company's
 * "on my way" template (free — no SMS provider involved), and logs the
 * hand-off on the job. The tech can tweak the message before hitting send.
 *
 * If the template carries {{eta}}, the tap grabs the device's position
 * (best-effort, ~4s budget) and the server computes a real drive-time ETA
 * to the job site to fill it — no estimate means the token lifts out and
 * the message still reads cleanly.
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
  const [busy, setBusy] = useState(false);

  // Only render on devices with a texting app (phones, tablets, Macs) —
  // sms: goes nowhere on a Windows/Linux desktop. Post-mount check so the
  // server render (which can't sniff the device) matches the first paint.
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canSendSms()), []);
  if (!supported) return null;

  const wantsEta = /\{\{\s*eta\s*\}\}/.test(message);

  async function send() {
    if (busy) return;
    setBusy(true);

    // Where's the tech right now? Best-effort — a denied prompt, no GPS fix,
    // or a template without {{eta}} just means no drive-time estimate.
    const pos = !wantsEta
      ? null
      : await new Promise<GeolocationPosition | null>((resolve) => {
          if (!navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { timeout: 4000, maximumAge: 120000 }
          );
        });

    let etaMinutes: number | null = null;
    try {
      const res = await fetch(`/api/app/jobs/${jobId}/on-my-way`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}
        ),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.etaMinutes === "number") etaMinutes = data.etaMinutes;
      router.refresh();
    } catch {
      // Logging failed — still hand the text off; the office note is best-effort
    }

    setBusy(false);
    setSent(new Date());
    window.location.href = smsHref(phone, fillEta(message, etaMinutes), isApplePlatform());
  }

  return (
    <button
      onClick={send}
      disabled={busy}
      title={
        sent
          ? `Sent ${sent.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} — opens Messages again`
          : "Text the client that you're on your way (opens your Messages app)"
      }
      className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60"
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <Navigation size={13} className={sent ? "text-green-600" : undefined} />
      )}
      On My Way{sent ? " ✓" : ""}
    </button>
  );
}
