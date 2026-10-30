"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import Modal from "@/components/Modal";
import ContactPicker, { type PickerContact } from "@/components/ContactPicker";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { toast } from "@/lib/toast";

/** "Enroll a client" on the Loyalty tab: pick a client (they need a mobile number) → a Square loyalty account. */
export default function LoyaltyActions({ canManage, contacts, words }: { canManage: boolean; contacts: PickerContact[]; words: { one: string; other: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManage) return null;

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson<{ account: { balance: number } }>("/api/app/payments/square/loyalty/enroll", { contactId });
      if (!ok || !data) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      toast(`Enrolled — ${data.account.balance} ${data.account.balance === 1 ? words.one : words.other}`);
      setOpen(false);
      setContactId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => (setError(null), setOpen(true))}>
        <UserPlus size={14} /> Enroll a client
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)}>
        {open && (
          <div className="ds">
            <h2 className="ds-h2">Enroll a client</h2>
            <p className="ds-body mt-1">Square keys rewards to the client&apos;s mobile number. If they already joined at the counter, their existing {words.other} come along.</p>
            <div className="mt-4">
              <ContactPicker contacts={contacts} value={contactId} onChange={setContactId} allowCreate={false} />
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-[color:var(--ds-bad)]">
                {error}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-full" onClick={() => setOpen(false)} disabled={busy}>
                Not now
              </button>
              <button type="button" className="btn-primary" onClick={enroll} disabled={busy || !contactId}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Enroll
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
