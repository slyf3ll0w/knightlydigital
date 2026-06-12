"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";

/** "Send it again" for a pending agreement — the signing link lives in email. */
export default function ResendContractButton({
  token,
  contractId,
}: {
  token: string;
  contractId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function resend() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/hub/resend-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, contractId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't resend right now.");
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-700">
        <Check size={12} />
        Sent — check your inbox
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        onClick={resend}
        disabled={busy}
        className="flex items-center gap-1 text-xs font-medium text-green-700 hover:underline disabled:opacity-50"
      >
        {busy && <Loader2 size={11} className="animate-spin" />}
        Resend email
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
