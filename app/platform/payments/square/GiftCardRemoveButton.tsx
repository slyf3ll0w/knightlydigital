"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { money } from "@/lib/statuses";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { toast } from "@/lib/toast";

/**
 * "Delete" a gift card (2026-10-30 request). Square has no delete: the card
 * is deactivated for good — DELETE /api/app/payments/square/gift-cards/[id]
 * (lib/gift-cards.ts removeGiftCard) — and any balance left is forfeited,
 * so the sheet says so before it happens. Managers only (the detail screen
 * only shows this to them).
 */
export default function GiftCardRemoveButton({ giftCardId, balanceCents, pending }: { giftCardId: string; balanceCents: number; pending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const ok = await confirmSheet({
      title: "Deactivate this gift card?",
      message:
        balanceCents > 0
          ? `The ${money(balanceCents / 100)} left on it can't be used again. This can't be undone.`
          : pending
            ? "Its unpaid invoice is archived with it. This can't be undone."
            : "It can't be used or brought back afterwards.",
      confirmLabel: "Deactivate",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/app/payments/square/gift-cards/${encodeURIComponent(giftCardId)}`, undefined, "DELETE");
    setBusy(false);
    if (!r.ok) {
      setError(r.data?.error ?? GENERIC_ERROR);
      return;
    }
    toast("Gift card deactivated");
    router.push("/app/payments?tab=giftcards");
    router.refresh();
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ds-bad)] hover:underline disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        Deactivate
      </button>
      {error && (
        <p className="mt-1 max-w-[16rem] text-xs text-[color:var(--ds-bad)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
