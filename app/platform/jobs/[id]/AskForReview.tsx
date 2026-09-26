"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { smsHref, isApplePlatform, canSendSms } from "@/lib/messaging";
import { confirmSheet, alertSheet } from "@/components/ConfirmSheet";
import { postJson } from "@/lib/safe-fetch";

/**
 * Texts the client a "leave us a review" message with the company's Google
 * review link — same free hand-off to the tech's own Messages app as the
 * On My Way button. Always clickable; without a review link configured it
 * walks the user to Settings to add their Google Business Profile link.
 */
export default function AskForReview({
  jobId,
  phone,
  message,
  hasReviewLink,
}: {
  jobId: string;
  phone: string;
  message: string;
  hasReviewLink: boolean;
}) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Same device gate as On My Way — no texting app on a Windows/Linux desktop
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canSendSms()), []);
  if (!supported) return null;

  async function send() {
    if (!hasReviewLink) {
      if (
        await confirmSheet({
          title: "Add your Google review link first",
          message: "It's what the text points your client to. Add it in Settings now?",
          confirmLabel: "Open Settings",
        })
      ) {
        router.push("/app/settings");
      }
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      // Record the request first — a 400 (no phone on file, already asked)
      // has to be seen, not swallowed behind an sms: hand-off that never
      // reaches anyone
      const { ok, data } = await postJson(`/api/app/jobs/${jobId}/review-request`);
      if (!ok) {
        alertSheet({ message: data?.error ?? "Couldn't send the review request." });
        return;
      }
      setSent(true);
      router.refresh();
      window.location.href = smsHref(phone, message, isApplePlatform());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={send}
      disabled={busy}
      title={
        hasReviewLink
          ? "Text the client your Google review link (opens your Messages app)"
          : "Set up your Google review link in Settings to use this"
      }
      className="ds-btn ds-btn-outline"
    >
      <Star size={13} className={sent ? "text-[color:var(--ds-good)]" : undefined} />
      Ask for Review{sent ? " ✓" : ""}
    </button>
  );
}
