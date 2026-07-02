"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Loader2 } from "lucide-react";
import { money } from "@/lib/statuses";

/**
 * Jobber-style nudge: the client approved a quote that carries a required
 * deposit, but no deposit invoice exists yet — surface collecting it as the
 * obvious next step instead of burying it in the overflow menu.
 */
export default function CollectDepositNudge({
  quoteId,
  amount,
}: {
  quoteId: string;
  amount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function collect() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/app/quotes/${quoteId}/collect-deposit`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't create the deposit invoice.");
        return;
      }
      if (data?.invoiceId) {
        router.push(`/app/invoices/${data.invoiceId}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg mb-6">
      <p className="text-sm font-medium text-green-800">
        This quote was approved with a {money(amount)} required deposit — collect it before the
        work starts.
      </p>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <button
          onClick={collect}
          disabled={busy}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
          Collect Deposit
        </button>
      </div>
    </div>
  );
}
