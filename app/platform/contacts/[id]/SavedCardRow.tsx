"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2 } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";

/** "Card on file" line in the client Details card, with a manager-only remove. */
export default function SavedCardRow({
  contactId,
  label,
  canRemove,
}: {
  contactId: string;
  label: string;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirmSheet({
      title: "Remove card on file?",
      message: "Recurring auto-charges and one-tap charging stop until the client saves a card again.",
      confirmLabel: "Remove Card",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/app/contacts/${contactId}/payment-method`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="col-span-2">
      <dt className="text-gray-400 text-xs">Card on file</dt>
      <dd className="text-gray-800 flex items-center gap-2">
        <CreditCard size={13} className="text-gray-400" />
        {label}
        {canRemove && (
          <button
            onClick={remove}
            disabled={busy}
            className="text-xs text-red-600 hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            {busy && <Loader2 size={11} className="animate-spin" />}
            Remove
          </button>
        )}
      </dd>
    </div>
  );
}
