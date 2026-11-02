"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Gift } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";
import { money } from "@/lib/statuses";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { toast } from "@/lib/toast";

/**
 * The owner's OK on a gift card whose invoice was marked paid by hand
 * (cash, check) — POST /api/app/payments/square/gift-cards/[id]
 * { action: "activate" } (lib/gift-cards.ts). Owners only; the tab shows
 * it to them alone. Loading the card emails the number to the recipient,
 * so the sheet says that before it happens.
 */
export default function GiftCardActivateButton({ giftCardId, amountCents }: { giftCardId: string; amountCents: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    const ok = await confirmSheet({
      title: `Load this ${money(amountCents / 100)} gift card?`,
      message: "Its invoice was marked paid by hand. Load it only once the money is actually in hand — the card number is emailed to the recipient right away and can be spent at once.",
      confirmLabel: "Load the card",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const r = await postJson(`/api/app/payments/square/gift-cards/${encodeURIComponent(giftCardId)}`, { action: "activate" });
    setBusy(false);
    if (!r.ok) {
      setError(r.data?.error ?? GENERIC_ERROR);
      return;
    }
    toast("Gift card loaded");
    router.refresh();
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={() => void activate()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ds-primary)] hover:underline disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Gift size={13} />}
        Load it
      </button>
      {error && (
        <p className="mt-1 max-w-[16rem] text-xs text-[color:var(--ds-bad)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
