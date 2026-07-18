"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2 } from "lucide-react";

/**
 * "Send to bank now" — closes the accruing settlement early. Payouts also run
 * automatically every business day, so failure here is never money lost; the
 * common "error" is just that nothing has cleared yet.
 */
export default function PayoutButton({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/app/payments/payout", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg("Payout started — funds are on their way to your bank.");
        setIsError(false);
        router.refresh();
      } else {
        setMsg(data.error ?? "Payout failed. Please try again.");
        setIsError(true);
      }
    } catch {
      setMsg("Payout failed. Please try again.");
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={send}
        disabled={busy}
        className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-full border disabled:opacity-50 transition-colors ${
          dark
            ? "border-white/25 text-white hover:bg-white/10"
            : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Landmark size={12} />}
        Send to bank now
      </button>
      {msg && (
        <p
          className={`text-xs max-w-64 text-right ${
            dark
              ? isError
                ? "text-amber-300"
                : "text-emerald-300"
              : isError
                ? "text-amber-600"
                : "text-green-600"
          }`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
