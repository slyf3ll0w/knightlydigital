"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { smsHref, isApplePlatform, canSendSms } from "@/lib/messaging";

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

  // Same device gate as On My Way — no texting app on a Windows/Linux desktop
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canSendSms()), []);
  if (!supported) return null;

  function send() {
    if (!hasReviewLink) {
      if (
        confirm(
          "Add your Google review link first — it's what the text points your client to. Add it in Settings now?"
        )
      ) {
        router.push("/app/settings");
      }
      return;
    }
    setSent(true);
    fetch(`/api/app/jobs/${jobId}/review-request`, { method: "POST" })
      .then(() => router.refresh())
      .catch(() => {});
    window.location.href = smsHref(phone, message, isApplePlatform());
  }

  return (
    <button
      onClick={send}
      title={
        hasReviewLink
          ? "Text the client your Google review link (opens your Messages app)"
          : "Set up your Google review link in Settings to use this"
      }
      className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
    >
      <Star size={13} className={sent ? "text-green-600" : undefined} />
      Ask for Review{sent ? " ✓" : ""}
    </button>
  );
}
