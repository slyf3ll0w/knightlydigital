"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

/**
 * "Text" for a phone number that may not be anyone yet (ticket #iq0lvg: a
 * caller who isn't saved could be called back from the call page but not
 * texted). A saved person opens their conversation; an unknown number is
 * handed to POST /api/app/messages/new-number, which finds the thread that
 * number already has or starts one under a placeholder the thread's Save
 * card can name later. Texts go out from the business line either way.
 */
export default function TextNumberButton({
  number,
  contactId,
  label = "Text",
  className = "flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-60",
}: {
  number: string;
  contactId?: string | null;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    if (contactId) {
      router.push(`/app/messages/thread/${contactId}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/messages/new-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: number }),
      });
      const data = (await res.json().catch(() => null)) as { contactId?: string; error?: string } | null;
      if (!res.ok || !data?.contactId) {
        setError(data?.error || "Couldn't open a conversation with that number.");
        return;
      }
      router.push(`/app/messages/thread/${data.contactId}`);
    } catch {
      setError("Couldn't open a conversation with that number.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => void open()} disabled={busy} className={className} title="Text them from your business number. Replies land in Messages.">
        <MessageCircle size={14} />
        {busy ? "Opening…" : label}
      </button>
      {error && (
        <p role="alert" className="absolute left-1/2 top-full z-10 mt-1.5 w-64 -translate-x-1/2 text-center text-xs text-[color:var(--ds-bad)]">
          {error}
        </p>
      )}
    </div>
  );
}
